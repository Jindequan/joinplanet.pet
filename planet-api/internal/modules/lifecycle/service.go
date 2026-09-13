// Package lifecycle：数据生命周期（B8 账户部分）——注销账号不破坏他人家庭的历史。
package lifecycle

import (
	"context"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/joinplanet/planet-api/internal/platform/db"
	"github.com/joinplanet/planet-api/internal/platform/httpx"
)

type Service struct{ Pool *pgxpool.Pool }

// DeleteAccount 注销（confirm 必须等于账号邮箱）。
// 家庭删除必须复用 families.DeleteFamily 的清理语义（撤转移/解链接/全员
// 成员关系结束）——否则注销会留下 404 死锁的 pending 转移和悬挂 ACL。
// 用户的幽灵残留（值班交接、计划指派、指派目标、推送令牌、受托授权）
// 一并清理；Pet 及其历史是持久领域数据，保留。共享责任链保留结构，
// 但注销账号的直接身份字段改为“已删除账号”，账号专属凭据和重放材料硬删。
func (s *Service) DeleteAccount(ctx context.Context, userID, confirmEmail, actualEmail string) error {
	if !strings.EqualFold(strings.TrimSpace(confirmEmail), actualEmail) {
		return httpx.ErrValidation("confirm must equal account email")
	}
	return db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		// Family is only an ACL container. Account deletion must not turn a
		// still-owned Pet into an ownerless resource through FK SET NULL.
		// 活跃宠物阻止注销；纪念态（archived）宠物的所有权就此终结，
		// 纪念数据保留但不再占用任何人的配额或访问面。
		var activeOwnedPets int
		if err := tx.QueryRow(ctx, `
			SELECT count(*) FROM pet_ownerships o
			JOIN pets p ON p.id = o.pet_id AND p.status = 'active' AND p.deleted_at IS NULL
			WHERE o.owner_user_id = $1 AND o.valid_to IS NULL AND o.deleted_at IS NULL`, userID).Scan(&activeOwnedPets); err != nil {
			return err
		}
		if activeOwnedPets > 0 {
			return httpx.ErrAccountHasOwnedPets()
		}
		if _, err := tx.Exec(ctx, `
			UPDATE pet_ownerships SET valid_to=now(), ended_reason='owner_account_deleted'
			WHERE owner_user_id = $1 AND valid_to IS NULL AND deleted_at IS NULL`, userID); err != nil {
			return err
		}
		// —— 拥有的家庭：完整复刻 DeleteFamily 的清理三件套 ——
		if _, err := tx.Exec(ctx, `UPDATE families SET status='deleted',deleted_at=now(),deleted_by_user_id=$1
			WHERE deleted_at IS NULL AND id IN (SELECT family_id FROM family_memberships WHERE user_id=$1 AND role='owner' AND status='active' AND ended_at IS NULL AND deleted_at IS NULL)`, userID); err != nil {
			return err
		}
		// 涉及这些家庭的 pending 转移全部取消（否则 accept/decline/cancel
		// 全部 404，uq_pet_transfers_pending 永久锁死该宠物的新转移）。
		if _, err := tx.Exec(ctx, `
			UPDATE pet_transfers SET status='cancelled', decided_by_user_id=$1, decided_at=now()
			WHERE status='pending' AND deleted_at IS NULL
			  AND (from_family_id IN (SELECT family_id FROM family_memberships WHERE user_id=$1 AND role='owner' AND status='active' AND ended_at IS NULL AND deleted_at IS NULL)
			    OR to_family_id IN (SELECT family_id FROM family_memberships WHERE user_id=$1 AND role='owner' AND status='active' AND ended_at IS NULL AND deleted_at IS NULL))`, userID); err != nil {
			return err
		}
		// 家庭可见边解除 + 全体成员关系结束（不止注销者本人）。
		if _, err := tx.Exec(ctx, `
			UPDATE family_pet_links SET unlinked_at=now(), unlinked_reason='family_deleted'
			WHERE unlinked_at IS NULL AND deleted_at IS NULL
			  AND family_id IN (SELECT family_id FROM family_memberships WHERE user_id=$1 AND role='owner' AND status='active' AND ended_at IS NULL AND deleted_at IS NULL)`, userID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			UPDATE family_memberships SET status='ended',ended_at=now(),ended_reason='family_deleted'
			WHERE status='active' AND ended_at IS NULL AND deleted_at IS NULL
			  AND family_id IN (SELECT family_id FROM family_memberships m2 WHERE m2.user_id=$1 AND m2.role='owner' AND m2.status='active' AND m2.ended_at IS NULL AND m2.deleted_at IS NULL)`, userID); err != nil {
			return err
		}
		// 其他人家庭里的本人成员关系。
		if _, err := tx.Exec(ctx, `UPDATE family_memberships SET status='ended',ended_at=now(),ended_reason='account_deleted' WHERE user_id=$1 AND status='active' AND ended_at IS NULL`, userID); err != nil {
			return err
		}
		// —— 幽灵残留清理 ——
		// 值班交接：结束该用户持有的全部 on-duty。
		if _, err := tx.Exec(ctx, `UPDATE pet_handoffs SET ended_at=now() WHERE user_id=$1 AND ended_at IS NULL`, userID); err != nil {
			return err
		}
		// 计划指派（含 owner 角色——注销者创建者的 owner 指派不应锁死计划）。
		if _, err := tx.Exec(ctx, `UPDATE care_plan_assignments SET deleted_at=now() WHERE user_id=$1 AND deleted_at IS NULL`, userID); err != nil {
			return err
		}
		// 已物化 occurrence 的指派目标置空。
		if _, err := tx.Exec(ctx, `UPDATE care_occurrences SET assigned_to_user_id=NULL WHERE assigned_to_user_id=$1 AND deleted_at IS NULL`, userID); err != nil {
			return err
		}
		// 推送令牌硬删：uq_push_tokens_token 非部分索引，软删会永久占用
		// 设备令牌槽位（令牌换绑他人时无法再注册）。
		if _, err := tx.Exec(ctx, `DELETE FROM push_tokens WHERE user_id=$1`, userID); err != nil {
			return err
		}
		// A deleted account must not leave behind access it personally granted,
		// nor delegations that keep naming it as the delegatee. Share links are
		// credentials plus a private snapshot, so remove them rather than only
		// revoking the hash.
		if _, err := tx.Exec(ctx, `DELETE FROM share_links WHERE created_by_user_id = $1`, userID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE pet_user_delegations SET revoked_at=now() WHERE (granted_by_user_id = $1 OR user_id = $1) AND revoked_at IS NULL`, userID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE pet_events SET recorded_by_user_id=NULL,edited_by_user_id=NULL WHERE recorded_by_user_id=$1 OR edited_by_user_id=$1`, userID); err != nil {
			return err
		}
		// These rows are account-scoped credentials or replay material. They are
		// not part of shared pet history and must not survive account deletion.
		if _, err := tx.Exec(ctx, `DELETE FROM user_preferences WHERE user_id=$1`, userID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM idempotency_keys WHERE principal_user_id=$1`, userID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM entitlements WHERE user_id=$1`, userID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM user_usage WHERE user_id=$1`, userID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM auth_challenges WHERE email=lower($1)`, actualEmail); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM sessions WHERE user_id=$1`, userID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM auth_rate_limits WHERE bucket IN ('auth_request_email_minute','auth_request_email_day') AND rate_key=lower($1)`, actualEmail); err != nil {
			return err
		}
		// Shared requests/batches/events keep the user FK so other family
		// members retain a truthful history. Replace direct identity fields with
		// a stable non-personal marker instead of exposing the deleted email or
		// name through those historical joins.
		tag, err := tx.Exec(ctx, `UPDATE users SET email='deleted+'||replace(id::text,'-','')||'@deleted.invalid', display_name='已删除账号', locale='zh-CN', timezone='UTC', status='deleted', deleted_at=now() WHERE id = $1 AND deleted_at IS NULL`, userID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return httpx.ErrNotFound("")
		}
		return nil
	})
}
