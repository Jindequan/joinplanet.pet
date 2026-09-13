package families

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/joinplanet/planet-api/internal/contracts"
	"github.com/joinplanet/planet-api/internal/platform/db"
	"github.com/joinplanet/planet-api/internal/platform/httpx"
)

type Service struct {
	Repo           *Repo
	Pool           *pgxpool.Pool
	Ent            contracts.EntitlementService
	CareRequests   contracts.CareRequestCloser
	Notifier       contracts.UserNotifier
	HandoffCleaner contracts.StandingHandoffCleaner
}

var _ contracts.MembershipService = (*Service)(nil)

func validateTimezone(tz string) error {
	if tz == "" {
		return nil // 使用默认值
	}
	if _, err := time.LoadLocation(tz); err != nil {
		return httpx.ErrValidation("invalid timezone (IANA name required)")
	}
	return nil
}

func normalizeName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" || len(name) > 60 {
		return "", httpx.ErrValidation("name must be 1-60 chars")
	}
	return name, nil
}

// requireMember：非成员一律 404（不泄露圈存在性，BACKEND-DESIGN §4.2）。
func (s *Service) requireMember(ctx context.Context, familyID, userID string, needOwner bool) (contracts.Member, error) {
	m, err := s.Repo.ActiveMemberRow(ctx, s.Pool, familyID, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return m, httpx.ErrNotFound("")
	}
	if err != nil {
		return m, err
	}
	if needOwner && m.Role != contracts.RoleOwner {
		return m, httpx.ErrRoleForbidden()
	}
	return m, nil
}

// Create 建圈（创建者即 owner），响应携带一次性邀请码明文。
func (s *Service) Create(ctx context.Context, userID, name, tz string) (contracts.Family, string, error) {
	return s.CreateWithIdempotency(ctx, userID, name, tz, "")
}

func (s *Service) CreateWithIdempotency(ctx context.Context, userID, name, tz, idempotencyKey string) (contracts.Family, string, error) {
	name, err := normalizeName(name)
	if err != nil {
		return contracts.Family{}, "", err
	}
	if err := validateTimezone(tz); err != nil {
		return contracts.Family{}, "", err
	}
	if tz == "" {
		tz = "Asia/Shanghai"
	}
	var c contracts.Family
	var invite string
	err = db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		claim, err := db.ClaimIdempotency(ctx, tx, userID, "family", idempotencyKey,
			db.RequestHash(name, tz))
		if err != nil {
			if errors.Is(err, db.ErrIdempotencyKeyReused) {
				return httpx.NewAppError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different request")
			}
			return err
		}
		if claim.Replay {
			var replay struct {
				InviteCode string `json:"invite_code"`
			}
			if err := json.Unmarshal(claim.ResponseBody, &replay); err != nil || replay.InviteCode == "" {
				return httpx.NewAppError(409, "IDEMPOTENCY_REPLAY_SECRET_UNAVAILABLE", "the original invite code is not recoverable")
			}
			c, err = s.Repo.GetFamily(ctx, tx, claim.ResourceID)
			if err != nil {
				return httpx.MapDBErr(err)
			}
			invite = replay.InviteCode
			c.Role = contracts.RoleOwner
			return nil
		}
		// Resolve entitlements after the idempotency claim so a replay can
		// recover its original result even if the user's current plan changed.
		best, err := s.Ent.BestKey(ctx, userID)
		if err != nil {
			return err
		}
		plan, err := s.Ent.PlanForEntitlement(ctx, best)
		if err != nil {
			return err
		}
		n, err := s.Repo.CountOwnedFamilies(ctx, tx, userID)
		if err != nil {
			return err
		}
		if n >= plan.Families {
			return httpx.ErrQuota("QUOTA_FAMILIES_EXCEEDED",
				map[string]any{"families": n, "family_max": plan.Families})
		}
		c, invite, err = s.Repo.CreateFamily(ctx, tx, name, tz, userID)
		if err != nil {
			return err
		}
		response, marshalErr := json.Marshal(map[string]string{"invite_code": invite})
		if marshalErr != nil {
			return marshalErr
		}
		if err := db.BindIdempotencyWithResponse(ctx, tx, userID, "family", idempotencyKey, "family", c.ID, response); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO family_memberships (family_id, user_id, role) VALUES ($1, $2, 'owner')`,
			c.ID, userID)
		if err != nil {
			return err
		}
		return recordAudit(ctx, tx, userID, "family_created", "family", c.ID, map[string]any{
			"name": c.Name,
		})
	})
	if err != nil {
		return contracts.Family{}, "", err
	}
	c.Role = contracts.RoleOwner
	return c, invite, nil
}

func (s *Service) List(ctx context.Context, userID string) ([]contracts.Family, error) {
	return s.Repo.ListForUser(ctx, s.Pool, userID)
}

func (s *Service) ListDeleted(ctx context.Context, userID string) ([]DeletedFamily, error) {
	return s.Repo.ListDeletedForOwner(ctx, s.Pool, userID)
}

func (s *Service) Detail(ctx context.Context, familyID, userID string) (contracts.Family, []contracts.Member, error) {
	m, err := s.requireMember(ctx, familyID, userID, false)
	if err != nil {
		return contracts.Family{}, nil, err
	}
	c, err := s.Repo.GetFamily(ctx, s.Pool, familyID)
	if err != nil {
		return contracts.Family{}, nil, httpx.MapDBErr(err)
	}
	c.Role = m.Role
	members, err := s.Repo.Members(ctx, s.Pool, familyID)
	return c, members, err
}

// Update 局部更新 name/timezone（owner）。
func (s *Service) Update(ctx context.Context, familyID, userID, name, tz string) (contracts.Family, error) {
	var c contracts.Family
	err := s.withLockedOwner(ctx, familyID, userID, func(tx pgx.Tx) error {
		current, err := s.Repo.GetFamily(ctx, tx, familyID)
		if err != nil {
			return httpx.MapDBErr(err)
		}
		if name == "" {
			name = current.Name
		} else if name, err = normalizeName(name); err != nil {
			return err
		}
		if tz == "" {
			tz = current.Timezone
		} else if err := validateTimezone(tz); err != nil {
			return err
		}
		c, err = s.Repo.UpdateFamily(ctx, tx, familyID, name, tz)
		if err != nil {
			return httpx.MapDBErr(err)
		}
		// 家庭时区是 civil-day 的权威。改时区时把本圈**主管**的宠物上、仍沿用
		// 旧时区的照护规则一并迁移（新物化立即用新时区；已有 occurrence 是
		// 不可变历史，保持原值）。主管判定 = 本圈持有 primary 边，或（宠物尚无
		// 任何 primary 边时）本圈是其唯一 live 链接——共享多圈的宠物时区冻结，
		// 避免非主管圈改时区平移他人宠物的 due_at。
		if tz != current.Timezone {
			if _, err := tx.Exec(ctx, `
				UPDATE care_rules cr SET timezone=$3, updated_at=now()
				WHERE cr.timezone=$2 AND cr.deleted_at IS NULL
				  AND EXISTS (
					SELECT 1 FROM family_pet_links fp
					JOIN care_plans ci ON ci.pet_id = fp.pet_id AND ci.id = cr.care_plan_id
					WHERE fp.family_id=$1 AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL
					  AND (
					    fp.relationship_type='primary'
					    OR (
					      NOT EXISTS (
						    SELECT 1 FROM family_pet_links pp
						    WHERE pp.pet_id = fp.pet_id AND pp.relationship_type='primary'
						      AND pp.unlinked_at IS NULL AND pp.deleted_at IS NULL
						  )
					      AND (
						    SELECT count(*) FROM family_pet_links pl
						    WHERE pl.pet_id = fp.pet_id AND pl.unlinked_at IS NULL AND pl.deleted_at IS NULL
						  ) = 1
					    )
					  )
				  )`, familyID, current.Timezone, tz); err != nil {
				return err
			}
		}
		c.Role = contracts.RoleOwner
		return recordAudit(ctx, tx, userID, "family_updated", "family", familyID, map[string]any{
			"name_changed":     current.Name != c.Name,
			"timezone_changed": current.Timezone != c.Timezone,
		})
	})
	return c, err
}

func (s *Service) RefreshInvite(ctx context.Context, familyID, userID string) (string, error) {
	return s.RefreshInviteWithRole(ctx, familyID, userID, contracts.RoleCaregiver)
}

// RefreshInviteWithIdempotency makes the one-time invite secret recoverable
// after a lost response without rotating it a second time.
func (s *Service) RefreshInviteWithIdempotency(ctx context.Context, familyID, userID, idempotencyKey string) (string, error) {
	return s.RefreshInviteWithRoleAndIdempotency(ctx, familyID, userID, contracts.RoleCaregiver, idempotencyKey)
}

func (s *Service) RefreshInviteWithRole(ctx context.Context, familyID, userID string, role contracts.Role) (string, error) {
	return s.RefreshInviteWithRoleAndIdempotency(ctx, familyID, userID, role, "")
}

func (s *Service) RefreshInviteWithRoleAndIdempotency(ctx context.Context, familyID, userID string, role contracts.Role, idempotencyKey string) (string, error) {
	if role != contracts.RoleCaregiver && role != contracts.RoleViewer {
		return "", httpx.ErrValidation("invite role must be caregiver or viewer")
	}
	var code string
	err := s.withLockedOwner(ctx, familyID, userID, func(tx pgx.Tx) error {
		scope := "family-invite-refresh:" + familyID
		claim, err := db.ClaimIdempotency(ctx, tx, userID, scope, idempotencyKey, db.RequestHash(familyID, string(role)))
		if errors.Is(err, db.ErrIdempotencyKeyReused) {
			return httpx.NewAppError(http.StatusConflict, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different request")
		}
		if err != nil {
			return err
		}
		if claim.Replay {
			var replay struct {
				InviteCode string `json:"invite_code"`
			}
			if err := json.Unmarshal(claim.ResponseBody, &replay); err != nil || replay.InviteCode == "" {
				return httpx.NewAppError(http.StatusConflict, "IDEMPOTENCY_REPLAY_SECRET_UNAVAILABLE", "the original invite code is not recoverable")
			}
			code = replay.InviteCode
			return nil
		}
		code, err = s.Repo.RefreshInviteCode(ctx, tx, familyID, role)
		if err != nil {
			return httpx.MapDBErr(err)
		}
		response, err := json.Marshal(map[string]string{"invite_code": code})
		if err != nil {
			return err
		}
		return db.BindIdempotencyWithResponse(ctx, tx, userID, scope, idempotencyKey, "family_invite", familyID, response)
	})
	return code, err
}

// Join 通过邀请码加入（邀请码决定 caregiver 或 viewer）；已是活跃成员 → ALREADY_MEMBER；
// 成员配额在事务内锁定成员行后检查（顺序：成员判定 → 配额 → 插入）。
func (s *Service) Join(ctx context.Context, userID, code string) (contracts.Family, error) {
	return s.JoinWithIdempotency(ctx, userID, code, "")
}

// JoinWithIdempotency makes invite acceptance durable across a lost response.
// The invite code is hashed for lookup; the request hash prevents one key from
// being reused for a different invite.
func (s *Service) JoinWithIdempotency(ctx context.Context, userID, code, idempotencyKey string) (contracts.Family, error) {
	code = strings.TrimSpace(strings.ToUpper(code))
	if len(code) < 6 {
		return contracts.Family{}, httpx.ErrValidation("invalid invite code")
	}
	var familyID string
	var joinRole contracts.Role
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		claim, err := db.ClaimIdempotency(ctx, tx, userID, "family-join", idempotencyKey, db.RequestHash(code))
		if err != nil {
			if errors.Is(err, db.ErrIdempotencyKeyReused) {
				return httpx.NewAppError(http.StatusConflict, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different request")
			}
			return err
		}
		if claim.Replay {
			familyID = claim.ResourceID
			if _, err := s.Repo.GetFamily(ctx, tx, familyID); err != nil {
				return httpx.MapDBErr(err)
			}
			// The original join response is intentionally not stored. Rebuild the
			// role from the live membership so a lost-response retry cannot return
			// an empty role (which is especially misleading for viewer invites).
			member, err := s.Repo.ActiveMemberRow(ctx, tx, familyID, userID)
			if err != nil {
				return httpx.MapDBErr(err)
			}
			joinRole = member.Role
			return nil
		}
		familyID, joinRole, err = s.Repo.FamilyIDByInviteCode(ctx, tx, HashInviteCode(code))
		if errors.Is(err, pgx.ErrNoRows) {
			return httpx.ErrNotFound("invalid invite code")
		}
		if err != nil {
			return err
		}
		// Serialize against soft-delete/restore. Checking the invite before the
		// transaction is necessary for lookup, but not sufficient for the write.
		// Without this lock a join could insert a member into a family that was
		// deleted between the lookup and the insert.
		if err := s.Repo.LockLiveFamily(ctx, tx, familyID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return httpx.ErrNotFound("invalid invite code")
			}
			return err
		}
		// Active-member detection belongs after the family lock so a concurrent
		// leave/rejoin cannot turn a quota error into a duplicate insert race.
		if _, memberErr := s.Repo.ActiveMemberRow(ctx, tx, familyID, userID); memberErr == nil {
			return httpx.NewAppError(http.StatusConflict, "ALREADY_MEMBER", "already an active member")
		} else if !errors.Is(memberErr, pgx.ErrNoRows) {
			return memberErr
		}
		// Resolve the owner's entitlement only after the family lock. Ownership
		// transfer uses the same lock, so the quota decision cannot use a stale
		// owner from a concurrent governance write. This is only an ACL abuse
		// guard; Pets/storage/AI ownership and billing never use Family counts.
		ownerID, err := s.Repo.FamilyOwnerRow(ctx, tx, familyID)
		if err != nil {
			return err
		}
		best, err := s.Ent.BestKey(ctx, ownerID)
		if err != nil {
			return err
		}
		plan, err := s.Ent.PlanForEntitlement(ctx, best)
		if err != nil {
			return err
		}
		n, err := s.Repo.LockActiveMembers(ctx, tx, familyID)
		if err != nil {
			return err
		}
		if n >= plan.Members {
			return httpx.ErrQuota("QUOTA_MEMBERS_EXCEEDED",
				map[string]any{"members": n, "member_max": plan.Members})
		}
		if joinRole != contracts.RoleCaregiver && joinRole != contracts.RoleViewer {
			return httpx.ErrValidation("invite role is invalid")
		}
		if err := s.Repo.JoinMember(ctx, tx, familyID, userID, joinRole); err != nil {
			return err
		}
		if err := recordAudit(ctx, tx, userID, "member_joined", "family", familyID, map[string]any{
			"role": string(joinRole),
		}); err != nil {
			return err
		}
		return db.BindIdempotency(ctx, tx, userID, "family-join", idempotencyKey, "family", familyID)
	})
	if err != nil {
		if errors.Is(err, ErrAlreadyMember) {
			return contracts.Family{}, httpx.NewAppError(http.StatusConflict, "ALREADY_MEMBER", "already an active member")
		}
		return contracts.Family{}, err
	}
	c, err := s.Repo.GetFamily(ctx, s.Pool, familyID)
	if err != nil {
		return contracts.Family{}, httpx.MapDBErr(err)
	}
	c.Role = joinRole
	return c, nil
}

// RemoveMember 仅 owner；触发器保证最后一个 owner 不可移除。
// 事务内先取圈级 advisory lock：防止"两个 owner 被并发移除"时触发器
// 在各自快照里都看到对方仍活跃，导致双提交后无 owner。
func (s *Service) RemoveMember(ctx context.Context, familyID, actorID, targetID string) error {
	var notices []contracts.CareRequestCancellationNotice
	err := s.withLockedOwner(ctx, familyID, actorID, func(tx pgx.Tx) error {
		if err := s.Repo.RemoveMember(ctx, tx, familyID, targetID); err != nil {
			return err
		}
		cancelled, err := s.revokeMemberCare(ctx, tx, familyID, targetID, actorID, "家庭成员已被移除，原照护请求已取消")
		notices = append(notices, cancelled...)
		if err != nil {
			return err
		}
		return recordAudit(ctx, tx, actorID, "member_removed", "family", familyID, map[string]any{
			"member_user_id": targetID,
		})
	})
	if err == nil {
		s.notifyCareRequestCancellations(ctx, notices)
	}
	return err
}

// notifyCareRequestCancellations is deliberately best-effort: the database
// transaction is the authority and a delivery failure must not undo removal.
func (s *Service) notifyCareRequestCancellations(ctx context.Context, notices []contracts.CareRequestCancellationNotice) {
	if s.Notifier == nil {
		return
	}
	for _, notice := range notices {
		_ = s.Notifier.NotifyUserData(ctx, notice.UserID,
			notice.PetName+" 的照护请求已结束", notice.Body, "care_handoff", map[string]string{
				"kind":            "care_handoff",
				"care_request_id": notice.RequestID,
				"family_id":       notice.FamilyID,
				"pet_id":          notice.PetID,
			})
	}
}

func (s *Service) revokeMemberCare(ctx context.Context, tx pgx.Tx, familyID, memberID, actorID, reason string) ([]contracts.CareRequestCancellationNotice, error) {
	if err := s.Repo.RemoveCarePlanHelpersForFamilyMember(ctx, tx, familyID, memberID); err != nil {
		return nil, err
	}
	if err := s.Repo.ReleaseCareOccurrencesForFamilyMember(ctx, tx, familyID, memberID); err != nil {
		return nil, err
	}
	var notices []contracts.CareRequestCancellationNotice
	if s.CareRequests != nil {
		cancelled, err := s.CareRequests.CancelOpenForFamilyMember(ctx, tx, familyID, memberID, actorID, reason)
		if err != nil {
			return nil, err
		}
		notices = append(notices, cancelled...)
	}
	if err := s.endStandingHandoff(ctx, tx, familyID, memberID); err != nil {
		return nil, err
	}
	return notices, nil
}

// UpdateMemberRole lets the owner switch a member between participating and
// view-only access without removing their history from the family.
func (s *Service) UpdateMemberRole(ctx context.Context, familyID, actorID, targetID string, role contracts.Role) error {
	if role != contracts.RoleCaregiver && role != contracts.RoleViewer {
		return httpx.ErrValidation("member role must be caregiver or viewer")
	}
	var notices []contracts.CareRequestCancellationNotice
	err := s.withLockedOwner(ctx, familyID, actorID, func(tx pgx.Tx) error {
		member, err := s.Repo.ActiveMemberRow(ctx, tx, familyID, targetID)
		if errors.Is(err, pgx.ErrNoRows) {
			return httpx.ErrNotFound("member not found")
		} else if err != nil {
			return err
		}
		if err := s.Repo.UpdateMemberRole(ctx, tx, familyID, targetID, role); err != nil {
			return err
		}
		if role == contracts.RoleViewer {
			cancelled, err := s.revokeMemberCare(ctx, tx, familyID, targetID, actorID, "成员已改为只查看，原照护请求已取消")
			notices = append(notices, cancelled...)
			if err != nil {
				return err
			}
		}
		return recordAudit(ctx, tx, actorID, "member_role_changed", "family", familyID, map[string]any{
			"member_user_id": targetID,
			"from":           string(member.Role),
			"to":             string(role),
		})
	})
	if err == nil {
		s.notifyCareRequestCancellations(ctx, notices)
	}
	return err
}

func (s *Service) endStandingHandoff(ctx context.Context, tx pgx.Tx, familyID, userID string) error {
	if s.HandoffCleaner == nil {
		return nil
	}
	return s.HandoffCleaner.EndForFamilyMember(ctx, tx, familyID, userID)
}

// Leave 自行退出；最后 owner 退出被拒绝（须先移交或删圈，B8 提供路径）。
func (s *Service) Leave(ctx context.Context, familyID, userID string) error {
	var notices []contracts.CareRequestCancellationNotice
	err := s.withLockedMember(ctx, familyID, userID, func(tx pgx.Tx) error {
		if err := s.Repo.RemoveMember(ctx, tx, familyID, userID); err != nil {
			return err
		}
		cancelled, err := s.revokeMemberCare(ctx, tx, familyID, userID, userID, "你已离开家庭，原照护请求已取消")
		notices = append(notices, cancelled...)
		if err != nil {
			return err
		}
		return recordAudit(ctx, tx, userID, "member_left", "family", familyID, nil)
	})
	if err == nil {
		s.notifyCareRequestCancellations(ctx, notices)
	}
	return err
}

// withLockedMember serializes membership/governance writes and rechecks that
// the caller is still active after acquiring the lock. This prevents a
// request that passed an earlier read from mutating a family after the caller
// was removed or the family was soft-deleted.
func (s *Service) withLockedMember(ctx context.Context, familyID, userID string, fn func(pgx.Tx) error) error {
	return mapOwnerGuard(db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		if err := lockLiveFamilyMutation(ctx, tx, familyID); err != nil {
			return err
		}
		if _, err := s.Repo.ActiveMemberRow(ctx, tx, familyID, userID); errors.Is(err, pgx.ErrNoRows) {
			return httpx.ErrNotFound("")
		} else if err != nil {
			return err
		}
		return fn(tx)
	}))
}

func (s *Service) withLockedOwner(ctx context.Context, familyID, userID string, fn func(pgx.Tx) error) error {
	return mapOwnerGuard(db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		if err := lockLiveFamilyMutation(ctx, tx, familyID); err != nil {
			return err
		}
		m, err := s.Repo.ActiveMemberRow(ctx, tx, familyID, userID)
		if errors.Is(err, pgx.ErrNoRows) {
			return httpx.ErrNotFound("")
		}
		if err != nil {
			return err
		}
		if m.Role != contracts.RoleOwner {
			return httpx.ErrRoleForbidden()
		}
		return fn(tx)
	}))
}

func lockLiveFamilyMutation(ctx context.Context, tx pgx.Tx, familyID string) error {
	var id string
	if err := tx.QueryRow(ctx,
		`SELECT id FROM families WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, familyID).Scan(&id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return httpx.ErrNotFound("")
		}
		return err
	}
	_, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, familyID)
	return err
}

func mapOwnerGuard(err error) error {
	if err == nil {
		return nil
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Message == "family_must_keep_one_owner" {
		return httpx.ErrLastOwner()
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return httpx.ErrNotFound("member not found")
	}
	return err
}

// Usage 圈的配额用量（成员/活跃宠物 + 上限），供套餐限制展示。
// 上限按圈主（owner）的权益定档——Join 的成员配额执行也按圈主判定，
// 展示与执行同一事实源，caregiver 不再看到自己的 plan 套在别人的圈上。
func (s *Service) Usage(ctx context.Context, familyID, userID string) (map[string]any, error) {
	if _, err := s.requireMember(ctx, familyID, userID, false); err != nil {
		return nil, err
	}
	ownerID, err := s.Repo.FamilyOwnerRow(ctx, s.Pool, familyID)
	if err != nil {
		return nil, httpx.MapDBErr(err)
	}
	plan, err := s.Ent.UserPlan(ctx, ownerID)
	if err != nil {
		return nil, err
	}
	members, err := s.Repo.Members(ctx, s.Pool, familyID)
	if err != nil {
		return nil, err
	}
	var activePets int
	if err := s.Pool.QueryRow(ctx, `
		SELECT count(*) FROM pet_ownerships o JOIN pets p ON p.id=o.pet_id
		WHERE o.owner_user_id = $1 AND o.valid_to IS NULL AND o.deleted_at IS NULL AND p.status='active' AND p.deleted_at IS NULL`, ownerID).
		Scan(&activePets); err != nil {
		return nil, err
	}
	return map[string]any{
		"plan":       plan.Key,
		"members":    len(members),
		"member_max": plan.Members,
		"pets":       activePets,
		"pet_max":    plan.Pets,
	}, nil
}

// TransferOwnership 移交所有权（owner；目标须为活跃成员）。发起者降为 caregiver。
// 幂等重试必须允许原发起者在第一次成功后继续取回结果，此时其角色已经是 caregiver。
func (s *Service) TransferOwnership(ctx context.Context, familyID, actorID, targetID, idempotencyKey string) error {
	return mapOwnerGuard(db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		if err := lockLiveFamilyMutation(ctx, tx, familyID); err != nil {
			return err
		}
		member, err := s.Repo.ActiveMemberRow(ctx, tx, familyID, actorID)
		if errors.Is(err, pgx.ErrNoRows) {
			return httpx.ErrNotFound("")
		}
		if err != nil {
			return err
		}
		claim, err := db.ClaimIdempotency(ctx, tx, actorID, "family-transfer:"+familyID, idempotencyKey, db.RequestHash(targetID))
		if errors.Is(err, db.ErrIdempotencyKeyReused) {
			return httpx.NewAppError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different request")
		}
		if err != nil {
			return err
		}
		if claim.Replay {
			return nil
		}
		if member.Role != contracts.RoleOwner {
			return httpx.ErrRoleForbidden()
		}
		if targetID == actorID {
			return httpx.ErrValidation("cannot transfer to yourself")
		}
		if _, err := s.Repo.ActiveMemberRow(ctx, tx, familyID, targetID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return httpx.ErrNotFound("target is not an active member")
			}
			return err
		}
		if err := s.Repo.TransferOwnership(ctx, tx, familyID, actorID, targetID); err != nil {
			return err
		}
		if err := recordAudit(ctx, tx, actorID, "ownership_transferred", "family", familyID, map[string]any{
			"from_user_id": actorID,
			"to_user_id":   targetID,
		}); err != nil {
			return err
		}
		return db.BindIdempotency(ctx, tx, actorID, "family-transfer:"+familyID, idempotencyKey, "family", familyID)
	}))
}

// DeleteFamily 删除家庭：仍有宠物链接（含纪念态）→ 409 FAMILY_NOT_EMPTY；
// 清空后软删除进入 30 天恢复窗（决策 D8）。
func (s *Service) DeleteFamily(ctx context.Context, familyID, userID, confirm string) error {
	return s.withLockedOwner(ctx, familyID, userID, func(tx pgx.Tx) error {
		var name string
		if err := tx.QueryRow(ctx, `SELECT name FROM families WHERE id = $1 AND deleted_at IS NULL`, familyID).Scan(&name); err != nil {
			return err
		}
		if strings.TrimSpace(confirm) != name {
			return httpx.ErrValidation("confirm must match Family name")
		}
		// The Family cannot disappear while another member still has access to
		// it. The UI disables the button in this state, but the API must enforce
		// the same invariant for direct clients and concurrent requests.
		var activeMembers int
		if err := tx.QueryRow(ctx, `
			SELECT count(*) FROM family_memberships
			WHERE family_id = $1 AND status='active' AND ended_at IS NULL AND deleted_at IS NULL`, familyID).Scan(&activeMembers); err != nil {
			return err
		}
		if activeMembers > 1 {
			return httpx.NewAppError(409, "FAMILY_NOT_EMPTY",
				"remove all other members before deleting the family")
		}
		// Family 是 ACL 容器，但"全家的宠物一夜消失"不是删除家庭应有的静默
		// 副作用。仍有链接的宠物（活跃或纪念态）必须先转移/解除共享。
		var linkedPets int
		if err := tx.QueryRow(ctx, `
			SELECT count(*) FROM family_pet_links fp
			JOIN pets p ON p.id = fp.pet_id AND p.deleted_at IS NULL
			WHERE fp.family_id = $1 AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL`, familyID).Scan(&linkedPets); err != nil {
			return err
		}
		if linkedPets > 0 {
			return httpx.NewAppError(409, "FAMILY_NOT_EMPTY",
				"transfer or unlink all pets before deleting the family")
		}
		// Family is only an ACL container. Remove its visibility edges and
		// membership, but never delete pets or their records.
		// Mark the family deleted first so the last-owner trigger permits the
		// membership cleanup below. Pets remain intact because the Family-Pet
		// only a visibility edge.
		if err := s.Repo.SoftDelete(ctx, tx, familyID, userID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE family_pet_links SET unlinked_at = now(), unlinked_reason='family_deleted' WHERE family_id = $1 AND unlinked_at IS NULL AND deleted_at IS NULL`, familyID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE family_memberships SET status='ended', ended_at = now(), ended_reason='family_deleted' WHERE family_id = $1 AND status='active' AND ended_at IS NULL AND deleted_at IS NULL`, familyID); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `UPDATE pet_transfers SET status = 'cancelled', decided_by_user_id = $2, decided_at = now()
			WHERE status = 'pending' AND (from_family_id = $1 OR to_family_id = $1) AND deleted_at IS NULL`, familyID, userID)
		if err != nil {
			return err
		}
		return recordAudit(ctx, tx, userID, "family_deleted", "family", familyID, map[string]any{
			"recovery_days": 30,
		})
	})
}

// Restore 恢复窗内（30 天）由删除者恢复。
func (s *Service) Restore(ctx context.Context, familyID, userID string) (contracts.Family, error) {
	var c contracts.Family
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		var deletedAt time.Time
		if err := tx.QueryRow(ctx, `SELECT deleted_at FROM families WHERE id = $1 AND deleted_at IS NOT NULL`, familyID).Scan(&deletedAt); err != nil {
			return err
		}
		// A deleted Family still occupies the owner's entitlement slot during
		// the restore window. Lock the same quota key used by Create so a
		// concurrent create/restore cannot exceed the user's plan.
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "ownfam:"+userID); err != nil {
			return err
		}
		best, err := s.Ent.BestKey(ctx, userID)
		if err != nil {
			return err
		}
		plan, err := s.Ent.PlanForEntitlement(ctx, best)
		if err != nil {
			return err
		}
		var owned int
		if err := tx.QueryRow(ctx, `
			SELECT count(*) FROM family_memberships m
			WHERE m.user_id = $1 AND m.role = 'owner'
			  AND (m.status='active' OR (m.family_id = $2 AND m.status='ended' AND m.ended_at >= $3))`, userID, familyID, deletedAt).Scan(&owned); err != nil {
			return err
		}
		if owned > plan.Families {
			return httpx.ErrQuota("QUOTA_FAMILIES_EXCEEDED", map[string]any{"families": owned, "family_max": plan.Families})
		}
		var restoredMembers int
		if err := tx.QueryRow(ctx, `
			SELECT count(*) FROM family_memberships WHERE family_id = $1 AND status='ended' AND ended_at >= $2`, familyID, deletedAt).Scan(&restoredMembers); err != nil {
			return err
		}
		if restoredMembers > plan.Members {
			return httpx.ErrQuota("QUOTA_MEMBERS_EXCEEDED", map[string]any{"members": restoredMembers, "member_max": plan.Members})
		}
		c, err = s.Repo.Restore(ctx, tx, familyID, userID, 30*24*time.Hour)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			UPDATE family_memberships SET status='active', ended_at = NULL, ended_reason=NULL
			WHERE family_id = $1 AND status='ended' AND ended_reason='family_deleted' AND ended_at >= $2`, familyID, deletedAt); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			UPDATE family_pet_links SET unlinked_at = NULL, unlinked_reason=NULL
			WHERE family_id = $1 AND unlinked_reason='family_deleted' AND unlinked_at >= $2`, familyID, deletedAt); err != nil {
			return err
		}
		return recordAudit(ctx, tx, userID, "family_restored", "family", familyID, map[string]any{
			"recovery_days": 30,
		})
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return contracts.Family{}, httpx.ErrNotFound("not restorable: unknown id, not the deleter, or past the 30-day window")
	}
	return c, err
}

// —— contracts.MembershipService 实现 ——
// 供 pets/meds/tasks 等模块做成员判定（唯一路径）。

func (s *Service) ActiveMember(ctx context.Context, familyID, userID string) (contracts.Member, bool, error) {
	m, err := s.Repo.ActiveMemberRow(ctx, s.Pool, familyID, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return contracts.Member{}, false, nil
	}
	if err != nil {
		return contracts.Member{}, false, err
	}
	return m, true, nil
}

func (s *Service) FamilyOwner(ctx context.Context, familyID string) (string, error) {
	id, err := s.Repo.FamilyOwnerRow(ctx, s.Pool, familyID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", httpx.ErrNotFound("")
	}
	return id, err
}

func (s *Service) FamilyTimezone(ctx context.Context, familyID string) (string, error) {
	tz, err := s.Repo.FamilyTimezoneRow(ctx, s.Pool, familyID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", httpx.ErrNotFound("")
	}
	return tz, err
}

// —— P0 主动服务契约实现（contracts.MembersReader / FamilyMetaReader / FamiliesReader）——

// ListMembers 圈内全部活跃成员（通知投递；digest/notify 经契约调用）。
func (s *Service) ListMembers(ctx context.Context, familyID string) ([]contracts.Member, error) {
	if _, err := s.Repo.FamilyTimezoneRow(ctx, s.Pool, familyID); err != nil {
		return nil, httpx.MapDBErr(err) // 圈不存在/已删除 → 404
	}
	return s.Repo.Members(ctx, s.Pool, familyID)
}

// ListMembersWithPref 开启了某类通知偏好（reminders|digest|alerts）的活跃成员。
// 投递方必须用它而不是 ListMembers，否则用户关闭的偏好会被无视。
func (s *Service) ListMembersWithPref(ctx context.Context, familyID, pref string) ([]contracts.Member, error) {
	if _, err := s.Repo.FamilyTimezoneRow(ctx, s.Pool, familyID); err != nil {
		return nil, httpx.MapDBErr(err)
	}
	return s.Repo.MembersWithPref(ctx, s.Pool, familyID, pref)
}

// FamilyMeta 圈基础信息（已删除 → 404）。
func (s *Service) FamilyMeta(ctx context.Context, familyID string) (contracts.Family, error) {
	c, err := s.Repo.GetFamily(ctx, s.Pool, familyID)
	if err != nil {
		return contracts.Family{}, httpx.MapDBErr(err)
	}
	return c, nil
}

// LiveFamilies 全部未删除的圈（调度器每分钟遍历）。
func (s *Service) LiveFamilies(ctx context.Context) ([]contracts.FamilyRef, error) {
	return s.Repo.LiveFamilies(ctx, s.Pool)
}

// InvitePreview 邀请码公开预览（auth:false）：返回加入后的权限、首只活跃宠物名与邀请人名；
// 无效/过期/不存在 → ErrNotFound（与 join 一致，不泄露圈存在性）。
type InvitePreview struct {
	Role        contracts.Role `json:"role"`
	PetName     *string        `json:"pet_name"`
	InviterName *string        `json:"inviter_name,omitempty"`
}

func (s *Service) PreviewInvite(ctx context.Context, code string) (InvitePreview, error) {
	code = strings.TrimSpace(strings.ToUpper(code))
	if len(code) < 6 {
		return InvitePreview{}, httpx.ErrNotFound("invalid invite code")
	}
	_, role, petName, inviterName, err := s.Repo.PreviewInvite(ctx, s.Pool, HashInviteCode(code))
	if errors.Is(err, pgx.ErrNoRows) {
		return InvitePreview{}, httpx.ErrNotFound("invalid invite code")
	}
	if err != nil {
		return InvitePreview{}, err
	}
	return InvitePreview{Role: role, PetName: petName, InviterName: inviterName}, nil
}
