// Package families：照护圈与成员（B2）。权限事实的根：用户经成员关系访问一切资源。
package families

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/joinplanet/planet-api/internal/contracts"
	"github.com/joinplanet/planet-api/internal/platform/db"
)

// ErrAlreadyMember：已是活跃成员时加入被拒（上层映射为 409 ALREADY_MEMBER）。
var ErrAlreadyMember = errors.New("already_member")

type Repo struct{ Pool *pgxpool.Pool }

type DeletedFamily struct {
	ID        string
	Name      string
	DeletedAt time.Time
}

const inviteAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789" // 无易混字符

func NewInviteCode() (plaintext, hash string, err error) {
	// 无偏取样：直接 %31 对 0..7 有约 3% 的重复偏好（256%31=8）。
	// 49.5 bit 熵下无实际影响，但拒绝采样零成本。
	b := make([]byte, 10)
	for i := range b {
		for {
			n, rerr := rand.Int(rand.Reader, big.NewInt(int64(len(inviteAlphabet))))
			if rerr != nil {
				return "", "", rerr
			}
			b[i] = inviteAlphabet[n.Int64()]
			break
		}
	}
	p := string(b)
	sum := sha256.Sum256([]byte(p))
	return p, hex.EncodeToString(sum[:]), nil
}

func HashInviteCode(p string) string {
	sum := sha256.Sum256([]byte(p))
	return hex.EncodeToString(sum[:])
}

// CreateFamily 建圈并返回邀请码明文（仅创建响应这一次可见）。
func (r *Repo) CreateFamily(ctx context.Context, q db.Q, name, tz, creatorID string) (contracts.Family, string, error) {
	code, hash, err := NewInviteCode()
	if err != nil {
		return contracts.Family{}, "", err
	}
	var c contracts.Family
	err = q.QueryRow(ctx, `
		INSERT INTO families (name, timezone, created_by_user_id)
		VALUES ($1, $2, $3) RETURNING id, name, timezone, created_at`,
		name, tz, creatorID).
		Scan(&c.ID, &c.Name, &c.Timezone, &c.CreatedAt)
	if err != nil {
		return c, "", err
	}
	if _, err := q.Exec(ctx, `INSERT INTO family_invitations (family_id, token_hash, expires_at, created_by_user_id)
		VALUES ($1,$2,now() + interval '30 days',$3)`, c.ID, hash, creatorID); err != nil {
		return contracts.Family{}, "", err
	}
	return c, code, err
}

func (r *Repo) GetFamily(ctx context.Context, q db.Q, familyID string) (contracts.Family, error) {
	var c contracts.Family
	err := q.QueryRow(ctx, `
		SELECT f.id, f.name, f.timezone, f.created_at,
			(SELECT count(*)::int FROM family_memberships m
			 WHERE m.family_id = f.id AND m.status='active' AND m.ended_at IS NULL AND m.deleted_at IS NULL),
			(SELECT count(*)::int FROM family_pet_links fp
			 WHERE fp.family_id = f.id AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL)
		FROM families f
		WHERE f.id = $1 AND f.deleted_at IS NULL`, familyID).
		Scan(&c.ID, &c.Name, &c.Timezone, &c.CreatedAt, &c.MemberCount, &c.PetCount)
	return c, err
}

func (r *Repo) UpdateFamily(ctx context.Context, q db.Q, familyID, name, tz string) (contracts.Family, error) {
	var c contracts.Family
	err := q.QueryRow(ctx, `
		UPDATE families SET name = $2, timezone = $3
		WHERE id = $1 AND deleted_at IS NULL
		RETURNING id, name, timezone, created_at`, familyID, name, tz).
		Scan(&c.ID, &c.Name, &c.Timezone, &c.CreatedAt)
	if err != nil {
		return c, err
	}
	err = q.QueryRow(ctx, `
		SELECT
			(SELECT count(*)::int FROM family_memberships m
			 WHERE m.family_id = $1 AND m.status='active' AND m.ended_at IS NULL AND m.deleted_at IS NULL),
			(SELECT count(*)::int FROM family_pet_links fp
			 WHERE fp.family_id = $1 AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL)`, familyID).
		Scan(&c.MemberCount, &c.PetCount)
	return c, err
}

func (r *Repo) RefreshInviteCode(ctx context.Context, q db.Q, familyID string, role contracts.Role) (plaintext string, err error) {
	code, hash, err := NewInviteCode()
	if err != nil {
		return "", err
	}
	if _, err := q.Exec(ctx, `UPDATE family_invitations SET revoked_at=now() WHERE family_id=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND deleted_at IS NULL`, familyID); err != nil {
		return "", err
	}
	if _, err := q.Exec(ctx, `INSERT INTO family_invitations (family_id, role, token_hash, expires_at) SELECT id,$2,$3,now() + interval '30 days' FROM families WHERE id=$1 AND deleted_at IS NULL`, familyID, role, hash); err != nil {
		return "", err
	}
	var exists bool
	if err := q.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM families WHERE id=$1 AND deleted_at IS NULL)`, familyID).Scan(&exists); err != nil {
		return "", err
	}
	if !exists {
		return "", pgx.ErrNoRows
	}
	return code, nil
}

func (r *Repo) FamilyIDByInviteCode(ctx context.Context, q db.Q, hash string) (string, contracts.Role, error) {
	var invite struct {
		id   string
		role contracts.Role
	}
	err := q.QueryRow(ctx, `SELECT family_id, role FROM family_invitations
		WHERE token_hash=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now() AND deleted_at IS NULL
		AND EXISTS (SELECT 1 FROM families f WHERE f.id=family_invitations.family_id AND f.deleted_at IS NULL)
		ORDER BY created_at DESC LIMIT 1`, hash).Scan(&invite.id, &invite.role)
	return invite.id, invite.role, err
}

// LockLiveFamily rechecks liveness inside the caller's transaction and
// serializes writes that create members/pets against family soft-delete.
func (r *Repo) LockLiveFamily(ctx context.Context, q db.Q, familyID string) error {
	var id string
	return q.QueryRow(ctx,
		`SELECT id FROM families WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, familyID).
		Scan(&id)
}

// ActiveMemberRow 活跃成员关系（无则 pgx.ErrNoRows）。
// 联查 families 且要求未删除：软删除的圈成员访问立即断（单一收口）。
func (r *Repo) ActiveMemberRow(ctx context.Context, q db.Q, familyID, userID string) (contracts.Member, error) {
	var m contracts.Member
	err := q.QueryRow(ctx, `
		SELECT m.user_id, u.email, u.display_name, m.role, m.joined_at
		FROM family_memberships m
		JOIN users u ON u.id = m.user_id
		JOIN families c ON c.id = m.family_id AND c.deleted_at IS NULL
		WHERE m.family_id = $1 AND m.user_id = $2 AND m.status='active' AND m.ended_at IS NULL AND m.deleted_at IS NULL
		  AND u.status = 'active' AND u.deleted_at IS NULL`,
		familyID, userID).
		Scan(&m.UserID, &m.Email, &m.DisplayName, &m.Role, &m.JoinedAt)
	return m, err
}

// CountOwnedFamilies 用户当前拥有的（未删）圈数；advisory lock 防并发建圈超限。
func (r *Repo) CountOwnedFamilies(ctx context.Context, q db.Q, userID string) (int, error) {
	if _, err := q.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "ownfam:"+userID); err != nil {
		return 0, err
	}
	var n int
	err := q.QueryRow(ctx, `
		SELECT count(*) FROM (
			SELECT c.id
			FROM family_memberships m
			JOIN families c ON c.id = m.family_id AND c.deleted_at IS NULL
			WHERE m.user_id = $1 AND m.role = 'owner' AND m.status='active' AND m.ended_at IS NULL AND m.deleted_at IS NULL
			UNION
			SELECT c.id
			FROM family_memberships dm
			JOIN families c ON c.id = dm.family_id
			WHERE dm.user_id = $1 AND dm.role = 'owner' AND dm.status='ended'
			  AND c.deleted_at IS NOT NULL
			  AND c.deleted_at > now() - interval '30 days'
		) owned`, userID).Scan(&n)
	return n, err
}

// TransferOwnership：先升目标为 owner，再降发起者（触发器要求降级时存在另一活跃 owner）。
func (r *Repo) TransferOwnership(ctx context.Context, q db.Q, familyID, fromUser, toUser string) error {
	if _, err := q.Exec(ctx, `
		UPDATE family_memberships SET role = 'owner'
		WHERE family_id = $1 AND user_id = $2 AND status='active' AND ended_at IS NULL AND deleted_at IS NULL AND role IN ('caregiver', 'viewer')`,
		familyID, toUser); err != nil {
		return err
	}
	tag, err := q.Exec(ctx, `
		UPDATE family_memberships SET role = 'caregiver'
		WHERE family_id = $1 AND user_id = $2 AND status='active' AND ended_at IS NULL AND deleted_at IS NULL AND role = 'owner'`,
		familyID, fromUser)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errors.New("actor is not an active owner")
	}
	return nil
}

// SoftDelete 软删除（清空才能删在上层校验）；邀请码随之失效（查询过滤）。
func (r *Repo) SoftDelete(ctx context.Context, q db.Q, familyID, byUser string) error {
	tag, err := q.Exec(ctx, `
		UPDATE families SET deleted_at = now(), deleted_by_user_id = $2, status='deleted'
		WHERE id = $1 AND deleted_at IS NULL`, familyID, byUser)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// Restore 恢复窗内由删除者恢复。
func (r *Repo) Restore(ctx context.Context, q db.Q, familyID, byUser string, retention time.Duration) (contracts.Family, error) {
	var c contracts.Family
	err := q.QueryRow(ctx, `
		UPDATE families SET deleted_at = NULL, deleted_by_user_id = NULL, status = 'active'
		WHERE id = $1 AND deleted_at IS NOT NULL AND deleted_by_user_id = $2
		  AND deleted_at > now() - ($3 || ' seconds')::interval
		RETURNING id, name, timezone, created_at`,
		familyID, byUser, fmt.Sprintf("%.0f", retention.Seconds())).
		Scan(&c.ID, &c.Name, &c.Timezone, &c.CreatedAt)
	return c, err
}

// LockActiveMembers 锁定圈的活跃成员行（配额事务串行化点，BACKEND-DESIGN §5）。
func (r *Repo) LockActiveMembers(ctx context.Context, q db.Q, familyID string) (int, error) {
	rows, err := q.Query(ctx, `
		SELECT user_id FROM family_memberships
		WHERE family_id = $1 AND status='active' AND ended_at IS NULL AND deleted_at IS NULL FOR UPDATE`, familyID)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	n := 0
	for rows.Next() {
		n++
	}
	return n, rows.Err()
}

// JoinMember 加入/复活成员关系（caregiver 或 viewer）。
// 已是活跃成员 → ErrAlreadyMember（ON CONFLICT 的 WHERE 不满足，无行被更新）。
func (r *Repo) JoinMember(ctx context.Context, q db.Q, familyID, userID string, role contracts.Role) error {
	tag, err := q.Exec(ctx, `
		INSERT INTO family_memberships (family_id, user_id, role)
		VALUES ($1, $2, $3)
		ON CONFLICT DO NOTHING`,
		familyID, userID, role)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrAlreadyMember
	}
	return nil
}

func (r *Repo) UpdateMemberRole(ctx context.Context, q db.Q, familyID, userID string, role contracts.Role) error {
	tag, err := q.Exec(ctx, `
		UPDATE family_memberships SET role = $3
		WHERE family_id = $1 AND user_id = $2 AND role <> 'owner'
		  AND status='active' AND ended_at IS NULL AND deleted_at IS NULL`,
		familyID, userID, role)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// RemoveCarePlanHelpersForFamilyMember keeps a view-only member out of every
// standing responsibility chain for Pets shared with this Family. The owner
// assignment is preserved because it may represent Pet ownership; runtime
// execution and escalation still apply the member's current access role.
func (r *Repo) RemoveCarePlanHelpersForFamilyMember(ctx context.Context, q db.Q, familyID, userID string) error {
	_, err := q.Exec(ctx, `
		UPDATE care_plan_assignments a
		SET deleted_at = now(), updated_at = now()
		FROM care_plans p
		JOIN family_pet_links fp ON fp.pet_id = p.pet_id
		  AND fp.family_id = $1 AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL
		WHERE a.care_plan_id = p.id AND a.user_id = $2 AND a.role = 'helper'
		  AND a.deleted_at IS NULL AND p.deleted_at IS NULL`, familyID, userID)
	return err
}

// ReleaseCareOccurrencesForFamilyMember removes a leaving member from open
// Family-owned occurrences. Completed facts are immutable; future materialized
// slots will use the remaining standing responsibility chain.
func (r *Repo) ReleaseCareOccurrencesForFamilyMember(ctx context.Context, q db.Q, familyID, userID string) error {
	_, err := q.Exec(ctx, `
		UPDATE care_occurrences co
		SET assigned_to_user_id = NULL
		FROM care_plans p
		WHERE p.id = co.care_plan_id AND p.family_id = $1
		  AND co.assigned_to_user_id = $2
		  AND co.status IN ('pending','missed') AND co.deleted_at IS NULL
		  AND p.deleted_at IS NULL`, familyID, userID)
	return err
}

// RemoveMember ends the membership row while preserving its history.
func (r *Repo) RemoveMember(ctx context.Context, q db.Q, familyID, userID string) error {
	tag, err := q.Exec(ctx, `
		UPDATE family_memberships SET status='ended', ended_at=now(), ended_reason='left'
		WHERE family_id = $1 AND user_id = $2 AND status='active' AND ended_at IS NULL AND deleted_at IS NULL`, familyID, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (r *Repo) Members(ctx context.Context, q db.Q, familyID string) ([]contracts.Member, error) {
	rows, err := q.Query(ctx, `
		SELECT m.user_id, u.email, u.display_name, m.role, m.joined_at
		FROM family_memberships m JOIN users u ON u.id = m.user_id
		WHERE m.family_id = $1 AND m.status='active' AND m.ended_at IS NULL AND m.deleted_at IS NULL
		  AND u.status = 'active' AND u.deleted_at IS NULL
		ORDER BY m.joined_at`, familyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []contracts.Member{}
	for rows.Next() {
		var m contracts.Member
		if err := rows.Scan(&m.UserID, &m.Email, &m.DisplayName, &m.Role, &m.JoinedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// prefColumns 通知偏好列白名单：列名来自固定枚举，杜绝拼接注入。
var prefColumns = map[string]string{
	"reminders": "reminders_enabled",
	"digest":    "digest_enabled",
	"alerts":    "alerts_enabled",
}

// MembersWithPref 列出开启了某类通知偏好的活跃成员（通知投递的收件人筛选）。
func (r *Repo) MembersWithPref(ctx context.Context, q db.Q, familyID, pref string) ([]contracts.Member, error) {
	col, ok := prefColumns[pref]
	if !ok {
		return nil, fmt.Errorf("families: unknown pref column: %s", pref)
	}
	rows, err := q.Query(ctx, `
		SELECT m.user_id, u.email, u.display_name, m.role, m.joined_at
		FROM family_memberships m JOIN users u ON u.id = m.user_id
		JOIN families c ON c.id = m.family_id AND c.deleted_at IS NULL
		WHERE m.family_id = $1 AND m.status='active' AND m.ended_at IS NULL AND m.deleted_at IS NULL
		  AND u.status = 'active' AND u.deleted_at IS NULL AND m.`+col+`
		ORDER BY m.joined_at`, familyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []contracts.Member{}
	for rows.Next() {
		var m contracts.Member
		if err := rows.Scan(&m.UserID, &m.Email, &m.DisplayName, &m.Role, &m.JoinedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (r *Repo) ListForUser(ctx context.Context, q db.Q, userID string) ([]contracts.Family, error) {
	rows, err := q.Query(ctx, `
		SELECT c.id, c.name, c.timezone, m.role, c.created_at,
			(SELECT count(*)::int FROM family_memberships mc
			 WHERE mc.family_id = c.id AND mc.status='active' AND mc.ended_at IS NULL AND mc.deleted_at IS NULL) AS member_count,
			(SELECT count(*)::int FROM family_pet_links fp
			 WHERE fp.family_id = c.id AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL) AS pet_count
		FROM families c
		JOIN family_memberships m ON m.family_id = c.id AND m.user_id = $1 AND m.status='active' AND m.ended_at IS NULL AND m.deleted_at IS NULL
		JOIN users u ON u.id = m.user_id AND u.status='active' AND u.deleted_at IS NULL
		WHERE c.deleted_at IS NULL
		ORDER BY c.created_at`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []contracts.Family{}
	for rows.Next() {
		var c contracts.Family
		if err := rows.Scan(&c.ID, &c.Name, &c.Timezone, &c.Role, &c.CreatedAt, &c.MemberCount, &c.PetCount); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *Repo) ListDeletedForOwner(ctx context.Context, q db.Q, userID string) ([]DeletedFamily, error) {
	rows, err := q.Query(ctx, `
		SELECT DISTINCT c.id, c.name, c.deleted_at
		FROM families c
		JOIN family_memberships dm ON dm.family_id = c.id AND dm.user_id = $1 AND dm.role = 'owner' AND dm.status='ended'
		WHERE c.deleted_at IS NOT NULL AND c.deleted_at > now() - interval '30 days'
		ORDER BY c.deleted_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DeletedFamily
	for rows.Next() {
		var c DeletedFamily
		if err := rows.Scan(&c.ID, &c.Name, &c.DeletedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *Repo) FamilyOwnerRow(ctx context.Context, q db.Q, familyID string) (string, error) {
	var id string
	err := q.QueryRow(ctx, `
		SELECT user_id FROM family_memberships
		WHERE family_id = $1 AND role = 'owner' AND status='active' AND ended_at IS NULL AND deleted_at IS NULL
		  AND EXISTS (SELECT 1 FROM users u WHERE u.id = family_memberships.user_id AND u.status='active' AND u.deleted_at IS NULL)
		ORDER BY joined_at LIMIT 1`, familyID).Scan(&id)
	return id, err
}

func (r *Repo) FamilyTimezoneRow(ctx context.Context, q db.Q, familyID string) (string, error) {
	var tz string
	err := q.QueryRow(ctx, `SELECT timezone FROM families WHERE id = $1 AND deleted_at IS NULL`, familyID).Scan(&tz)
	return tz, err
}

// LiveFamilies 全部未删除的圈（notify 调度器遍历用，contracts.FamiliesReader）。
func (r *Repo) LiveFamilies(ctx context.Context, q db.Q) ([]contracts.FamilyRef, error) {
	rows, err := q.Query(ctx, `SELECT id, name, timezone FROM families WHERE deleted_at IS NULL ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []contracts.FamilyRef{}
	for rows.Next() {
		var c contracts.FamilyRef
		if err := rows.Scan(&c.ID, &c.Name, &c.Timezone); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// PreviewInvite resolves an unexpired invitation token to a live Family,
// 返回邀请权限、首只活跃宠物名与邀请人（圈主）display_name；
// 无效/过期/不存在 → pgx.ErrNoRows。
func (r *Repo) PreviewInvite(ctx context.Context, q db.Q, hash string) (string, contracts.Role, *string, *string, error) {
	var familyID string
	var role contracts.Role
	var petName, inviterName *string
	err := q.QueryRow(ctx, `
		SELECT c.id, i.role,
			(SELECT p.name FROM pets p
				 JOIN family_pet_links fp ON fp.pet_id = p.id AND fp.family_id = c.id AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL
			 WHERE p.status = 'active' AND p.deleted_at IS NULL ORDER BY p.created_at LIMIT 1),
			(SELECT u.display_name FROM family_memberships m JOIN users u ON u.id = m.user_id
			 WHERE m.family_id = c.id AND m.role = 'owner' AND m.status='active' AND m.ended_at IS NULL AND m.deleted_at IS NULL
			   AND u.status = 'active' AND u.deleted_at IS NULL
			 ORDER BY m.joined_at LIMIT 1)
		FROM families c
		JOIN family_invitations i ON i.family_id=c.id AND i.token_hash=$1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>now() AND i.deleted_at IS NULL
		WHERE c.deleted_at IS NULL`, hash).
		Scan(&familyID, &role, &petName, &inviterName)
	return familyID, role, petName, inviterName, err
}
