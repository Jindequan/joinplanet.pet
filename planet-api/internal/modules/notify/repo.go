package notify

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/joinplanet/planet-api/internal/platform/db"
)

type Repo struct{ Pool *pgxpool.Pool }

// Notification is one user-facing delivery attempt. The row is only created
// after an immediate delivery failed; the in-app inbox remains the source of
// truth, while this table makes the external side effect recoverable.
type Notification struct {
	ID          string
	UserID      string
	Title       string
	Body        string
	Kind        string
	Data        map[string]string
	Attempts    int
	AvailableAt time.Time
}

type UserContact struct {
	UserID      string
	Email       string
	DisplayName string
}

func (r *Repo) UserContact(ctx context.Context, q db.Q, userID string) (UserContact, error) {
	var c UserContact
	err := q.QueryRow(ctx, `
		SELECT id::text, email, COALESCE(display_name, '')
		FROM users
		WHERE id = $1 AND status = 'active' AND deleted_at IS NULL`, userID).
		Scan(&c.UserID, &c.Email, &c.DisplayName)
	return c, err
}

type PushToken struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	Token     string    `json:"token"`
	Platform  string    `json:"platform"`
	CreatedAt time.Time `json:"created_at"`
}

const tokenCols = `id, COALESCE(user_id::text,''), token, platform, created_at`

func scanToken(scan func(dest ...any) error) (PushToken, error) {
	var t PushToken
	err := scan(&t.ID, &t.UserID, &t.Token, &t.Platform, &t.CreatedAt)
	return t, err
}

// UpsertToken：同 token 重复注册幂等；令牌换绑（用户/平台变化）时覆盖。
func (r *Repo) UpsertToken(ctx context.Context, q db.Q, userID, token, platform string) (PushToken, error) {
	row := q.QueryRow(ctx, `
		INSERT INTO push_tokens (user_id, token, platform)
		VALUES ($1,$2,$3)
		ON CONFLICT (token) DO UPDATE
		  SET user_id = EXCLUDED.user_id,
		      platform = EXCLUDED.platform,
		      last_seen_at = now(),
		      deleted_at = NULL
		RETURNING `+tokenCols, userID, token, platform)
	return scanToken(row.Scan)
}

// DeleteToken 只删本人名下的令牌（越权删除 → 无行 → ErrNoRows）。
func (r *Repo) DeleteToken(ctx context.Context, q db.Q, userID, token string) error {
	tag, err := q.Exec(ctx, `DELETE FROM push_tokens WHERE user_id = $1 AND token = $2`, userID, token)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// TokensForUsers 一批用户的全量令牌（推送展开用）。
func (r *Repo) TokensForUsers(ctx context.Context, q db.Q, userIDs []string) ([]PushToken, error) {
	rows, err := q.Query(ctx, `SELECT `+tokenCols+` FROM push_tokens WHERE user_id = ANY($1) AND deleted_at IS NULL`, userIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PushToken{}
	for rows.Next() {
		t, err := scanToken(rows.Scan)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// Prefs：用户×Family 成员关系上的通知偏好。偏好属于成员关系，因为
// 同一个用户在不同 Family 的照护职责可以不同。
type Prefs struct {
	Reminders bool `json:"reminders"`
	Digest    bool `json:"digest"`
	Alerts    bool `json:"alerts"`
}

func DefaultPrefs() Prefs { return Prefs{Reminders: true, Digest: true, Alerts: true} }

func (r *Repo) PrefsGet(ctx context.Context, q db.Q, userID, familyID string) (Prefs, error) {
	var p Prefs
	err := q.QueryRow(ctx, `
		SELECT reminders_enabled, digest_enabled, alerts_enabled FROM family_memberships
		WHERE user_id = $1 AND family_id = $2 AND status = 'active' AND ended_at IS NULL AND deleted_at IS NULL`, userID, familyID).
		Scan(&p.Reminders, &p.Digest, &p.Alerts)
	if errors.Is(err, pgx.ErrNoRows) {
		return DefaultPrefs(), nil
	}
	return p, err
}

func (r *Repo) PrefsUpsert(ctx context.Context, q db.Q, userID, familyID string, p Prefs) (Prefs, error) {
	row := q.QueryRow(ctx, `
		UPDATE family_memberships SET reminders_enabled = $3, digest_enabled = $4, alerts_enabled = $5
		WHERE user_id = $1 AND family_id = $2 AND status = 'active' AND ended_at IS NULL AND deleted_at IS NULL
		RETURNING reminders_enabled, digest_enabled, alerts_enabled`, userID, familyID, p.Reminders, p.Digest, p.Alerts)
	var out Prefs
	err := row.Scan(&out.Reminders, &out.Digest, &out.Alerts)
	return out, err
}

// ClaimRun 抢占一次性运行权：insert-on-conflict-do-nothing。
// 抢到（首跑）= true；已跑过（重启/上一分钟已触发）= false。重启安全。
func (r *Repo) ClaimRun(ctx context.Context, q db.Q, job, familyID, dedupeKey string) (bool, error) {
	var id string
	err := q.QueryRow(ctx, `
		INSERT INTO job_runs (job, family_id, dedupe_key, status, attempts, available_at, locked_until)
		VALUES ($1,$2,$3,'running',1,now(),now() + interval '5 minutes')
		ON CONFLICT (job, family_id, dedupe_key) DO UPDATE
		SET status = 'running', attempts = job_runs.attempts + 1,
		    locked_until = now() + interval '5 minutes', last_error = NULL
		WHERE job_runs.status <> 'succeeded'
		  AND job_runs.available_at <= now()
		  AND (job_runs.locked_until IS NULL OR job_runs.locked_until < now())
		RETURNING id`, job, familyID, dedupeKey).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil // 冲突：本 key 已运行
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func (r *Repo) CompleteRun(ctx context.Context, q db.Q, job, familyID, dedupeKey string) error {
	_, err := q.Exec(ctx, `
		UPDATE job_runs SET status='succeeded', completed_at=now(), locked_until=NULL, last_error=NULL
		WHERE job=$1 AND family_id=$2 AND dedupe_key=$3`, job, familyID, dedupeKey)
	return err
}

// FailRun 标记一次尝试失败。重试节奏：1 分钟后可再认领；累计尝试达到
// maxJobAttempts 次后置 available_at=infinity，永久放弃该 key（该 key 通常是
// 某天的 digest/alerts/reminder，放弃只影响当天，不会无限重试刷日志）。
func (r *Repo) FailRun(ctx context.Context, q db.Q, job, familyID, dedupeKey, message string) error {
	_, err := q.Exec(ctx, `
		UPDATE job_runs SET status='failed',
			available_at = CASE WHEN attempts >= $5 THEN 'infinity'::timestamptz
			                    ELSE now() + interval '1 minute' END,
			locked_until=NULL, last_error=$4
		WHERE job=$1 AND family_id=$2 AND dedupe_key=$3`,
		job, familyID, dedupeKey, message, MaxJobAttempts)
	return err
}

// MaxJobAttempts 是单个 job_runs key 放弃前的最大尝试次数（含首次）。
const MaxJobAttempts = 10

// MemberPref：圈内成员 + 其某类偏好（缺行 = 开）。
type MemberPref struct {
	UserID      string
	Email       string
	DisplayName string
	Enabled     bool
}

// prefColumns 白名单（列名来自固定枚举，杜绝拼接注入）。
var prefColumns = map[string]string{
	"reminders": "reminders_enabled",
	"digest":    "digest_enabled",
	"alerts":    "alerts_enabled",
}

// MembersWithPref 圈内全部活跃成员及其某类偏好（偏好列名经白名单映射）。
func (r *Repo) MembersWithPref(ctx context.Context, q db.Q, familyID, pref string) ([]MemberPref, error) {
	col, ok := prefColumns[pref]
	if !ok {
		return nil, errors.New("notify: unknown pref column: " + pref)
	}
	rows, err := q.Query(ctx, `
		SELECT m.user_id, u.email, u.display_name, m.`+col+`
		FROM family_memberships m
		JOIN users u ON u.id = m.user_id
		JOIN families c ON c.id = m.family_id AND c.deleted_at IS NULL
		WHERE m.family_id = $1 AND m.status = 'active' AND m.ended_at IS NULL AND m.deleted_at IS NULL
		  AND u.status = 'active' AND u.deleted_at IS NULL
		ORDER BY m.joined_at`, familyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []MemberPref{}
	for rows.Next() {
		var mp MemberPref
		if err := rows.Scan(&mp.UserID, &mp.Email, &mp.DisplayName, &mp.Enabled); err != nil {
			return nil, err
		}
		out = append(out, mp)
	}
	return out, rows.Err()
}

// EnqueueNotification is intentionally small and accepts db.Q so callers can
// attach a delivery to an existing transaction when they have one. Current
// care-request flows enqueue after commit only when the immediate side effect
// fails; the durable inbox still prevents losing the user action itself.
func (r *Repo) EnqueueNotification(ctx context.Context, q db.Q, n Notification) error {
	data, err := json.Marshal(n.Data)
	if err != nil {
		return err
	}
	_, err = q.Exec(ctx, `
		INSERT INTO notification_outbox (user_id, title, body, kind, data)
		VALUES ($1,$2,$3,$4,$5::jsonb)`, n.UserID, n.Title, n.Body, n.Kind, data)
	return err
}

// ClaimNotifications leases ready rows without holding a database transaction
// during provider I/O. SKIP LOCKED lets multiple API instances drain safely.
func (r *Repo) ClaimNotifications(ctx context.Context, q db.Q, limit int) ([]Notification, error) {
	if limit <= 0 {
		return nil, fmt.Errorf("notify: claim limit must be positive")
	}
	rows, err := q.Query(ctx, `
		WITH next AS (
			SELECT id
			FROM notification_outbox
			WHERE sent_at IS NULL AND deleted_at IS NULL
			  AND available_at <= now()
			  AND (locked_until IS NULL OR locked_until < now())
			ORDER BY created_at, id
			FOR UPDATE SKIP LOCKED
			LIMIT $1
		)
		UPDATE notification_outbox o
		SET locked_until = now() + interval '5 minutes', attempts = o.attempts + 1
		FROM next
		WHERE o.id = next.id
		RETURNING o.id::text, o.user_id::text, o.title, o.body, o.kind,
		          o.data, o.attempts, o.available_at`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]Notification, 0, limit)
	for rows.Next() {
		var n Notification
		var raw []byte
		if err := rows.Scan(&n.ID, &n.UserID, &n.Title, &n.Body, &n.Kind, &raw, &n.Attempts, &n.AvailableAt); err != nil {
			return nil, err
		}
		if len(raw) > 0 && string(raw) != "null" {
			if err := json.Unmarshal(raw, &n.Data); err != nil {
				return nil, fmt.Errorf("notify: decode outbox data: %w", err)
			}
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

func (r *Repo) MarkNotificationSent(ctx context.Context, q db.Q, id string) error {
	_, err := q.Exec(ctx, `
		UPDATE notification_outbox
		SET sent_at = now(), locked_until = NULL, last_error = NULL
		WHERE id = $1 AND sent_at IS NULL`, id)
	return err
}

const MaxNotificationAttempts = 10

func (r *Repo) FailNotification(ctx context.Context, q db.Q, n Notification, message string, now time.Time) error {
	// Attempts is incremented at claim time. After ten attempts the row is
	// parked at infinity for operator inspection instead of retrying forever.
	backoff := time.Minute
	for i := 1; i < n.Attempts && i < 6; i++ {
		backoff *= 2
	}
	_, err := q.Exec(ctx, `
		UPDATE notification_outbox
		SET available_at = $2, locked_until = NULL, last_error = $3
		WHERE id = $1 AND sent_at IS NULL`, n.ID,
		func() time.Time {
			if n.Attempts >= MaxNotificationAttempts {
				return time.Date(9999, 12, 31, 23, 59, 59, 0, time.UTC)
			}
			return now.UTC().Add(backoff)
		}(), message)
	return err
}
