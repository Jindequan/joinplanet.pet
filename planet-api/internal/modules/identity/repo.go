// Package identity：邮箱验证码登录、session 生命周期（B1）。
package identity

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/joinplanet/planet-api/internal/platform/db"
)

type Repo struct{ Pool *pgxpool.Pool }

type LoginCodeRow struct {
	ID        string
	CodeHash  string
	ExpiresAt time.Time
	Attempts  int
}

type UserRow struct {
	ID          string
	Email       string
	DisplayName string
	Locale      string
	Status      string
	CreatedAt   time.Time
}

type SessionRow struct {
	ID        string
	UserID    string
	ExpiresAt time.Time
}

type SessionInfo struct {
	ID          string    `json:"id"`
	DeviceLabel string    `json:"device_label"`
	CreatedAt   time.Time `json:"created_at"`
	LastSeenAt  time.Time `json:"last_seen_at"`
	ExpiresAt   time.Time `json:"expires_at"`
	IsCurrent   bool      `json:"is_current"`
}

type UserPreferences struct {
	UserID          string
	DefaultFamilyID *string
	DefaultPetID    *string
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

func (r *Repo) GetPreferences(ctx context.Context, q db.Q, userID string) (UserPreferences, error) {
	_, err := q.Exec(ctx, `
		INSERT INTO user_preferences (user_id) VALUES ($1)
		ON CONFLICT (user_id) DO NOTHING`, userID)
	if err != nil {
		return UserPreferences{}, err
	}
	var p UserPreferences
	err = q.QueryRow(ctx, `
		SELECT user_id, default_family_id, default_pet_id, created_at, updated_at
		FROM user_preferences WHERE user_id = $1`, userID).
		Scan(&p.UserID, &p.DefaultFamilyID, &p.DefaultPetID, &p.CreatedAt, &p.UpdatedAt)
	return p, err
}

func (r *Repo) UpdatePreferences(ctx context.Context, q db.Q, userID string, familyID, petID *string) (UserPreferences, error) {
	var p UserPreferences
	err := q.QueryRow(ctx, `
		INSERT INTO user_preferences (user_id, default_family_id, default_pet_id)
		VALUES ($1,$2,$3)
		ON CONFLICT (user_id) DO UPDATE SET
			default_family_id = EXCLUDED.default_family_id,
			default_pet_id = EXCLUDED.default_pet_id,
			updated_at = now()
		RETURNING user_id, default_family_id, default_pet_id, created_at, updated_at`, userID, familyID, petID).
		Scan(&p.UserID, &p.DefaultFamilyID, &p.DefaultPetID, &p.CreatedAt, &p.UpdatedAt)
	return p, err
}

// AllowRateLimit atomically consumes one hit in a database-backed UTC window.
// A conflict at the limit returns no row, so concurrent API instances cannot
// both pass the same auth throttle.
func (r *Repo) AllowRateLimit(ctx context.Context, q db.Q, bucket, key string, now time.Time, window time.Duration, limit int) (bool, error) {
	if limit <= 0 || window <= 0 {
		return false, nil
	}
	windowStart := now.UTC().Truncate(window)
	var hit int
	err := q.QueryRow(ctx, `
		INSERT INTO auth_rate_limits (bucket, rate_key, window_start, hit_count)
		VALUES ($1, $2, $3, 1)
		ON CONFLICT (bucket, rate_key, window_start) DO UPDATE
		SET hit_count = auth_rate_limits.hit_count + 1
		WHERE auth_rate_limits.hit_count < $4
		RETURNING hit_count`, bucket, key, windowStart, limit).Scan(&hit)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	// Keep this bounded for active keys without making cleanup part of the
	// admission decision. A periodic job can remove all old windows later.
	_, _ = q.Exec(ctx, `DELETE FROM auth_rate_limits WHERE bucket = $1 AND rate_key = $2 AND window_start < $3`, bucket, key, windowStart)
	return hit > 0, nil
}

// ConsumePendingCodes 作废该邮箱所有待用验证码（发新码前调用，保证同时最多一个有效码）。
func (r *Repo) ConsumePendingCodes(ctx context.Context, q db.Q, email string) error {
	_, err := q.Exec(ctx,
		`UPDATE auth_challenges SET consumed_at = now() WHERE email = $1 AND purpose = 'sign_in' AND consumed_at IS NULL AND deleted_at IS NULL`, email)
	return err
}

func (r *Repo) InsertLoginCode(ctx context.Context, q db.Q, email, codeHash string, expiresAt time.Time, ip string) (string, error) {
	var ipArg any
	if ip != "" {
		ipArg = ip
	}
	var id string
	err := q.QueryRow(ctx, `
		INSERT INTO auth_challenges (email, purpose, code_hash, expires_at, created_ip)
		VALUES ($1, 'sign_in', $2, $3, $4) RETURNING id`, email, codeHash, expiresAt, ipArg).Scan(&id)
	return id, err
}

func (r *Repo) RevokeLoginCode(ctx context.Context, q db.Q, id string) error {
	_, err := q.Exec(ctx, `UPDATE auth_challenges SET consumed_at = now() WHERE id = $1 AND purpose = 'sign_in' AND consumed_at IS NULL AND deleted_at IS NULL`, id)
	return err
}

// LatestPendingCode 取最新待用验证码并锁定（FOR UPDATE，防并发验证）。
func (r *Repo) LatestPendingCode(ctx context.Context, q db.Q, email string) (LoginCodeRow, error) {
	var row LoginCodeRow
	err := q.QueryRow(ctx, `
		SELECT id, code_hash, expires_at, attempts FROM auth_challenges
		WHERE email = $1 AND purpose = 'sign_in' AND consumed_at IS NULL AND deleted_at IS NULL
		ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, email).
		Scan(&row.ID, &row.CodeHash, &row.ExpiresAt, &row.Attempts)
	if errors.Is(err, pgx.ErrNoRows) {
		return row, pgx.ErrNoRows
	}
	return row, err
}

func (r *Repo) ConsumeCode(ctx context.Context, q db.Q, id string) (bool, error) {
	tag, err := q.Exec(ctx,
		`UPDATE auth_challenges SET consumed_at = now() WHERE id = $1 AND purpose = 'sign_in' AND consumed_at IS NULL AND deleted_at IS NULL`, id)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func (r *Repo) FailCodeAttempt(ctx context.Context, q db.Q, id string) error {
	// 第 5 次失败即作废（attempts 达到上限同时 consume）
	_, err := q.Exec(ctx, `
		UPDATE auth_challenges
		SET attempts = attempts + 1,
		    consumed_at = CASE WHEN attempts + 1 >= 5 THEN now() ELSE consumed_at END
		WHERE id = $1 AND purpose = 'sign_in' AND deleted_at IS NULL`, id)
	return err
}

// UserByEmail 只看未注销行：注销邮箱可按部分唯一索引语义重新注册，
// 不过滤会在复用时扫出多行。
func (r *Repo) UserByEmail(ctx context.Context, q db.Q, email string) (UserRow, error) {
	var u UserRow
	err := q.QueryRow(ctx, `
		SELECT id, email, display_name, locale, status, created_at FROM users
		WHERE lower(email) = lower($1) AND deleted_at IS NULL`, email).
		Scan(&u.ID, &u.Email, &u.DisplayName, &u.Locale, &u.Status, &u.CreatedAt)
	return u, err
}

func (r *Repo) CreateUser(ctx context.Context, q db.Q, email, displayName string) (UserRow, error) {
	var u UserRow
	err := q.QueryRow(ctx, `
		INSERT INTO users (email, display_name) VALUES ($1, $2)
		RETURNING id, email, display_name, locale, status, created_at`, email, displayName).
		Scan(&u.ID, &u.Email, &u.DisplayName, &u.Locale, &u.Status, &u.CreatedAt)
	if err == nil {
		_, err = q.Exec(ctx, `
			INSERT INTO subscriptions (user_id, plan, status)
			VALUES ($1, 'free', 'active')`, u.ID)
	}
	return u, err
}

func (r *Repo) UpdateUserName(ctx context.Context, q db.Q, userID, name string) (UserRow, error) {
	var u UserRow
	err := q.QueryRow(ctx, `
		UPDATE users SET display_name = $2, updated_at = now()
		WHERE id = $1 AND status = 'active' RETURNING id, email, display_name, locale, status, created_at`, userID, name).
		Scan(&u.ID, &u.Email, &u.DisplayName, &u.Locale, &u.Status, &u.CreatedAt)
	return u, err
}

func (r *Repo) UpdateUserLocale(ctx context.Context, q db.Q, userID, locale string) (UserRow, error) {
	var u UserRow
	err := q.QueryRow(ctx, `
		UPDATE users SET locale = $2, updated_at = now()
		WHERE id = $1 AND status = 'active' RETURNING id, email, display_name, locale, status, created_at`, userID, locale).
		Scan(&u.ID, &u.Email, &u.DisplayName, &u.Locale, &u.Status, &u.CreatedAt)
	return u, err
}

func (r *Repo) CreateSession(ctx context.Context, q db.Q, userID, tokenHash, device string, expiresAt time.Time) (SessionRow, error) {
	var s SessionRow
	err := q.QueryRow(ctx, `
		INSERT INTO sessions (user_id, token_hash, device_label, expires_at)
		VALUES ($1, $2, $3, $4)
		RETURNING id, user_id, expires_at`, userID, tokenHash, device, expiresAt).
		Scan(&s.ID, &s.UserID, &s.ExpiresAt)
	return s, err
}

// SessionByToken 联查用户（撤销/过期即无效）。
func (r *Repo) SessionByToken(ctx context.Context, q db.Q, tokenHash string) (SessionRow, UserRow, error) {
	var s SessionRow
	var u UserRow
	err := q.QueryRow(ctx, `
		SELECT s.id, s.user_id, s.expires_at,
		       u.id, u.email, u.display_name, u.locale, u.status, u.created_at
		FROM sessions s JOIN users u ON u.id = s.user_id
		WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
		  AND u.status = 'active' AND u.deleted_at IS NULL`, tokenHash).
		Scan(&s.ID, &s.UserID, &s.ExpiresAt,
			&u.ID, &u.Email, &u.DisplayName, &u.Locale, &u.Status, &u.CreatedAt)
	return s, u, err
}

// ExtendSession 滑动续期 + last_seen 刷新。
// last_seen_at 单独节流（5 分钟粒度）：不能把它锁进续期条件里，否则会话
// 前 60 天"最后活跃"永远停在创建时刻；也不该每请求重写行（updated_at
// 触发器 + 行版本写放大），节流后绝大多数请求两条语句都命中 0 行。
func (r *Repo) ExtendSession(ctx context.Context, q db.Q, sessionID string) error {
	if _, err := q.Exec(ctx, `
		UPDATE sessions SET last_seen_at = now()
		WHERE id = $1 AND last_seen_at < now() - interval '5 minutes'`, sessionID); err != nil {
		return err
	}
	_, err := q.Exec(ctx, `
		UPDATE sessions
		SET expires_at = now() + interval '90 days'
		WHERE id = $1 AND expires_at < now() + interval '30 days'`, sessionID)
	return err
}

func (r *Repo) RevokeSession(ctx context.Context, q db.Q, sessionID string) error {
	_, err := q.Exec(ctx,
		`UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, sessionID)
	return err
}

func (r *Repo) ListSessions(ctx context.Context, q db.Q, userID, currentSessionID string) ([]SessionInfo, error) {
	rows, err := q.Query(ctx, `
		SELECT id, device_label, created_at, last_seen_at, expires_at, id = $2
		FROM sessions
		WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now() AND deleted_at IS NULL
		ORDER BY last_seen_at DESC, created_at DESC`, userID, currentSessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []SessionInfo{}
	for rows.Next() {
		var item SessionInfo
		if err := rows.Scan(&item.ID, &item.DeviceLabel, &item.CreatedAt, &item.LastSeenAt, &item.ExpiresAt, &item.IsCurrent); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (r *Repo) RevokeOwnedSession(ctx context.Context, q db.Q, userID, sessionID string) error {
	_, err := q.Exec(ctx, `
		UPDATE sessions SET revoked_at = now()
		WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND deleted_at IS NULL`, sessionID, userID)
	return err
}

func (r *Repo) RevokeOtherSessions(ctx context.Context, q db.Q, userID, currentSessionID string) error {
	_, err := q.Exec(ctx, `
		UPDATE sessions SET revoked_at = now()
		WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL AND deleted_at IS NULL`, userID, currentSessionID)
	return err
}
