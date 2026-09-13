package transfers

import (
	"context"
	"encoding/json"
	"errors"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/joinplanet/planet-api/internal/contracts"
	platformaudit "github.com/joinplanet/planet-api/internal/platform/audit"
	"github.com/joinplanet/planet-api/internal/platform/db"
	"github.com/joinplanet/planet-api/internal/platform/httpx"
)

type Service struct {
	Repo    *Repo
	Pool    *pgxpool.Pool
	Guard   contracts.PetsGuard
	Members contracts.MembershipService
	Ent     contracts.EntitlementService
	Events  contracts.TimelineRecorder
	Shares  contracts.PetShareInvalidator
}

// Create 发起转移：源圈 owner；目标圈须存在且未删除、不等于源圈；纪念态宠物可转移（历史随行）。
// 这是家庭治理动作，不要求发起人同时是宠物的全局 owner；目标家庭
// owner 仍必须明确接受，所有权才会真正改变。
func (s *Service) Create(ctx context.Context, petID, userID, toFamilyID, fromFamilyID, idempotencyKey string) (Transfer, error) {
	if toFamilyID == "" {
		return Transfer{}, httpx.ErrValidation("to_family_id is required")
	}
	// 转移由源家庭 owner 发起。先确认用户仍能看到这只宠物，具体的
	// 源家庭 owner 校验在同一事务、家庭锁之后再次完成。
	_, _, err := s.Guard.RequirePet(ctx, petID, false, false)
	if err != nil {
		return Transfer{}, err
	}
	var t Transfer
	err = db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `SELECT id FROM pets WHERE id = $1 FOR UPDATE`, petID); err != nil {
			return err
		}
		claim, err := db.ClaimIdempotency(ctx, tx, userID, "pet-transfer:"+petID, idempotencyKey, db.RequestHash(toFamilyID+":"+fromFamilyID))
		if errors.Is(err, db.ErrIdempotencyKeyReused) {
			return httpx.NewAppError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different request")
		}
		if err != nil {
			return err
		}
		if claim.Replay {
			t, err = s.Repo.Get(ctx, tx, claim.ResourceID)
			return err
		}
		var currentFamily string
		var sourceErr error
		if fromFamilyID != "" {
			sourceErr = tx.QueryRow(ctx, `
				SELECT fp.family_id::text
				FROM family_pet_links fp
				JOIN families c ON c.id = fp.family_id AND c.deleted_at IS NULL
				JOIN family_memberships cm ON cm.family_id = fp.family_id AND cm.user_id = $2
				WHERE fp.pet_id = $1 AND fp.family_id = $3 AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL
				  AND cm.role = 'owner' AND cm.status='active' AND cm.ended_at IS NULL AND cm.deleted_at IS NULL`, petID, userID, fromFamilyID).Scan(&currentFamily)
		} else {
			sourceErr = tx.QueryRow(ctx, `
				SELECT fp.family_id::text
				FROM family_pet_links fp
				JOIN families c ON c.id = fp.family_id AND c.deleted_at IS NULL
				JOIN family_memberships cm ON cm.family_id = fp.family_id AND cm.user_id = $2
				WHERE fp.pet_id = $1 AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL
				  AND cm.role = 'owner' AND cm.status='active' AND cm.ended_at IS NULL AND cm.deleted_at IS NULL
				ORDER BY fp.created_at LIMIT 1`, petID, userID).Scan(&currentFamily)
		}
		if err := sourceErr; err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return httpx.ErrNotFound("")
			}
			return err
		}
		if currentFamily == toFamilyID {
			return httpx.ErrValidation("target family is the pet's current family")
		}
		familyIDs := []string{currentFamily, toFamilyID}
		sort.Strings(familyIDs)
		for _, familyID := range uniqueStrings(familyIDs) {
			var liveID string
			if err := tx.QueryRow(ctx, `SELECT id FROM families WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, familyID).Scan(&liveID); err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					return httpx.ErrNotFound("")
				}
				return err
			}
		}
		// 家庭锁拿到以后重验源边和 owner 身份，避免成员在前置查询后
		// 被移除仍继续改变宠物归属。
		var sourceOwner bool
		if err := tx.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1
				FROM family_pet_links fp
				JOIN family_memberships fm ON fm.family_id=fp.family_id AND fm.user_id=$2
				JOIN families f ON f.id=fp.family_id AND f.deleted_at IS NULL
				WHERE fp.family_id=$3 AND fp.pet_id=$1
				  AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL
				  AND fm.role='owner' AND fm.status='active' AND fm.ended_at IS NULL AND fm.deleted_at IS NULL
			)`, petID, userID, currentFamily).Scan(&sourceOwner); err != nil {
			return err
		}
		if !sourceOwner {
			return httpx.ErrNotFound("")
		}
		lockedPet, _, err := s.Guard.RequirePetInTx(ctx, tx, petID, userID, false, false)
		if err != nil {
			return err
		}
		_ = lockedPet
		t, err = s.Repo.Create(ctx, tx, petID, currentFamily, toFamilyID, &userID)
		if err != nil {
			return err
		}
		if err := platformaudit.Record(ctx, tx, userID, "pet_transfer_requested", "pet", petID, map[string]any{
			"from_family_id": currentFamily,
			"to_family_id":   toFamilyID,
			"transfer_id":    t.ID,
		}); err != nil {
			return err
		}
		return db.BindIdempotency(ctx, tx, userID, "pet-transfer:"+petID, idempotencyKey, "transfer", t.ID)
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return Transfer{}, httpx.ErrNotFound("")
	}
	if errors.Is(err, errPetMoved) {
		return Transfer{}, httpx.NewAppError(409, "TRANSFER_CONFLICT", "pet is no longer in the source family")
	}
	if errors.Is(err, ErrPendingExists) {
		return Transfer{}, httpx.NewAppError(409, "TRANSFER_PENDING_EXISTS", "pet already has a pending transfer")
	}
	return t, err
}

// List direction=incoming（我是目标圈 owner）/ outgoing（我是源圈 owner）。
func (s *Service) List(ctx context.Context, familyID, userID, direction string) ([]Transfer, error) {
	m, ok, err := s.Members.ActiveMember(ctx, familyID, userID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, httpx.ErrNotFound("")
	}
	if direction != "outgoing" {
		direction = "incoming"
	}
	if m.Role != contracts.RoleOwner {
		return nil, httpx.ErrRoleForbidden()
	}
	return s.Repo.ListForFamily(ctx, s.Pool, familyID, direction)
}

// Accept 目标圈 owner 接受：配额检查 → 更新 current owner → 移出源 Family、
// 迁移照护上下文 → 增加目标 ACL → 撤销外部分享 → 记事件（单事务）。
// “转移”与“共享”是两个不同动作：共享保留源 Family 的 live ACL，转移则解除
// 源 Family 的 live ACL；Pet 本体、时间线和照护事实仍然保留，并随 Pet 交给目标 Family。
func (s *Service) Accept(ctx context.Context, transferID, userID, idempotencyKey string) (Transfer, error) {
	t, err := s.Repo.Get(ctx, s.Pool, transferID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Transfer{}, httpx.ErrNotFound("")
	}
	if err != nil {
		return Transfer{}, err
	}
	err = db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		lockedTransfer, lockErr := s.Repo.GetForUpdate(ctx, tx, transferID)
		if lockErr != nil {
			return lockErr
		}
		claim, claimErr := db.ClaimIdempotency(ctx, tx, userID, "transfer-accept:"+transferID, idempotencyKey, db.RequestHash(transferID))
		if errors.Is(claimErr, db.ErrIdempotencyKeyReused) {
			return httpx.NewAppError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different request")
		}
		if claimErr != nil {
			return claimErr
		}
		if claim.Replay {
			t, err = s.Repo.Get(ctx, tx, claim.ResourceID)
			return err
		}
		if lockedTransfer.Status != "pending" {
			return ErrNotPending
		}
		t = lockedTransfer
		var petID string
		var archived bool
		var oldOwner string
		if err := tx.QueryRow(ctx, `
			SELECT id, status = 'archived', COALESCE((SELECT owner_user_id::text FROM pet_ownerships o WHERE o.pet_id=pets.id AND o.valid_to IS NULL AND o.deleted_at IS NULL),'')
			FROM pets WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
			t.PetID).Scan(&petID, &archived, &oldOwner); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				// 宠物已被删除：转移本应在删宠时取消（pets.Delete 已联动），
				// 这里兜底给可操作的语义而不是裸 500。
				return errPetMoved
			}
			return err
		}
		// Lock both sides in a stable order. The source edge is part of the
		// authorization decision: accepting after that edge was removed would
		// turn a stale invitation into an ownership mutation.
		familyIDs := uniqueStrings([]string{t.FromFamilyID, t.ToFamilyID})
		sort.Strings(familyIDs)
		for _, familyID := range familyIDs {
			if err := lockFamilyDecision(ctx, tx, familyID); err != nil {
				return err
			}
		}
		if t.FromFamilyID != "" {
			var sourceEdge bool
			if err := tx.QueryRow(ctx,
				`SELECT EXISTS (SELECT 1 FROM family_pet_links WHERE family_id = $1 AND pet_id = $2 AND unlinked_at IS NULL AND deleted_at IS NULL)`,
				t.FromFamilyID, t.PetID).Scan(&sourceEdge); err != nil {
				return err
			}
			if !sourceEdge || oldOwner == "" {
				return errPetMoved
			}
		}
		targetOwner, err := activeOwnerInTx(ctx, tx, t.ToFamilyID, userID)
		if err != nil {
			return err
		}
		if oldOwner == targetOwner {
			return httpx.ErrValidation("pet is already owned by the target user")
		}
		if err := lockUserPair(ctx, tx, oldOwner, targetOwner); err != nil {
			return err
		}
		// 活跃宠物占目标圈槽位（纪念态免占）
		if !archived {
			best, err := s.Ent.BestKey(ctx, targetOwner)
			if err != nil {
				return err
			}
			plan, err := s.Ent.PlanForEntitlement(ctx, best)
			if err != nil {
				return err
			}
			var n int
			if err := tx.QueryRow(ctx, `
				SELECT count(*) FROM pet_ownerships o JOIN pets p ON p.id=o.pet_id WHERE o.owner_user_id = $1 AND o.valid_to IS NULL AND o.deleted_at IS NULL AND p.status='active' AND p.deleted_at IS NULL`,
				targetOwner).Scan(&n); err != nil {
				return err
			}
			if n >= plan.Pets {
				return httpx.ErrQuota("QUOTA_PETS_EXCEEDED",
					map[string]any{"pets": n, "pet_max": plan.Pets})
			}
		}
		if _, err := tx.Exec(ctx, `UPDATE pet_ownerships SET valid_to=now(), ended_reason='transfer' WHERE pet_id=$1 AND valid_to IS NULL AND deleted_at IS NULL`, t.PetID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO pet_ownerships (pet_id,owner_user_id,source_transfer_id,created_by_user_id) VALUES ($1,$2,$3,$4)`, t.PetID, targetOwner, t.ID, userID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE pets SET updated_at=now(),version=version+1 WHERE id=$1`, t.PetID); err != nil {
			return err
		}
		// A transfer is a move, not a share. Close only the source edge; other
		// independently shared Families remain visible. The historical row is
		// retained for audit/recovery, but it is no longer an access grant.
		if _, err := tx.Exec(ctx, `
			UPDATE family_pet_links
			SET unlinked_at=now(), unlinked_reason='pet_transferred', updated_at=now()
			WHERE family_id=$1 AND pet_id=$2 AND unlinked_at IS NULL AND deleted_at IS NULL`, t.FromFamilyID, t.PetID); err != nil {
			return err
		}
		// Care plans are Family-scoped, so move the source Family's care setup
		// to the target instead of leaving an invisible schedule behind. Past
		// occurrences remain untouched; pending occurrences are reopened without
		// a stale assignee, and open handoffs are closed with an audit event.
		if err := cancelOpenRequestsForTransfer(ctx, tx, t.PetID, userID); err != nil {
			return err
		}
		// A batch may contain several Pets. Do not move the whole batch because
		// one Pet changed Families; detach this Pet's historical requests from a
		// mixed batch, while a batch containing only this Pet can move intact.
		if _, err := tx.Exec(ctx, `
			UPDATE care_requests moved
			SET batch_id=NULL, updated_at=now()
			WHERE moved.pet_id=$1 AND moved.batch_id IS NOT NULL AND moved.deleted_at IS NULL
			  AND EXISTS (
				SELECT 1 FROM care_requests other
				WHERE other.batch_id=moved.batch_id AND other.pet_id<>moved.pet_id AND other.deleted_at IS NULL
			  )`, t.PetID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			UPDATE care_handoff_batches
			SET family_id=$2, updated_at=now()
			WHERE family_id=$1 AND id IN (
				SELECT DISTINCT batch_id FROM care_requests
				WHERE pet_id=$3 AND batch_id IS NOT NULL
			)`, t.FromFamilyID, t.ToFamilyID, t.PetID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			UPDATE care_requests SET family_id=$2, updated_at=now()
			WHERE pet_id=$3 AND family_id=$1 AND deleted_at IS NULL`, t.FromFamilyID, t.ToFamilyID, t.PetID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			WITH moved_plans AS (
				UPDATE care_plans SET family_id=$2, updated_at=now()
				WHERE pet_id=$3 AND family_id=$1 AND deleted_at IS NULL
				RETURNING id
			), cleared_assignments AS (
				UPDATE care_plan_assignments SET deleted_at=now(), updated_at=now()
				WHERE care_plan_id IN (SELECT id FROM moved_plans) AND deleted_at IS NULL
			), reset_occurrences AS (
				UPDATE care_occurrences SET assigned_to_user_id=NULL, updated_at=now()
				WHERE care_plan_id IN (SELECT id FROM moved_plans)
				  AND status IN ('pending','missed') AND deleted_at IS NULL
				RETURNING id
			)
			SELECT count(*) FROM reset_occurrences`, t.FromFamilyID, t.ToFamilyID, t.PetID); err != nil {
			return err
		}
		// 目标圈可能已通过共享持有 (family_id, pet_id) 的 live 边：冲突时
		// 必须升级为 primary，否则 DO NOTHING 会让全库失去 primary 边
		// （主家庭时区推导随之退化为规则快照）。
		if _, err := tx.Exec(ctx, `
			INSERT INTO family_pet_links (family_id,pet_id,relationship_type,linked_by_user_id)
			VALUES ($1,$2,'primary',$3)
			ON CONFLICT (family_id, pet_id) WHERE unlinked_at IS NULL AND deleted_at IS NULL
			DO UPDATE SET relationship_type='primary', updated_at=now()`, t.ToFamilyID, t.PetID, userID); err != nil {
			return err
		}
		// Ownership change lapses the delegations the previous owner granted;
		// the new owner can re-grant whatever should survive the handover.
		if oldOwner != "" {
			if _, err := tx.Exec(ctx, `
				UPDATE pet_user_delegations SET revoked_at=now()
				WHERE pet_id=$1 AND revoked_at IS NULL AND granted_by_user_id=$2`, t.PetID, oldOwner); err != nil {
				return err
			}
		}
		if s.Shares != nil {
			if err := s.Shares.RevokeForPet(ctx, tx, t.PetID); err != nil {
				return err
			}
		}
		if oldOwner != "" {
			var sourceUsed int
			if err := tx.QueryRow(ctx, `SELECT count(*) FROM pet_ownerships o JOIN pets p ON p.id=o.pet_id WHERE o.owner_user_id=$1 AND o.valid_to IS NULL AND o.deleted_at IS NULL AND p.status='active' AND p.deleted_at IS NULL`, oldOwner).Scan(&sourceUsed); err != nil {
				return err
			}
			if err := s.Ent.SetUsage(ctx, tx, oldOwner, "pets_created", "current", int64(sourceUsed)); err != nil {
				return err
			}
			var targetUsed int
			if err := tx.QueryRow(ctx, `SELECT count(*) FROM pet_ownerships o JOIN pets p ON p.id=o.pet_id WHERE o.owner_user_id=$1 AND o.valid_to IS NULL AND o.deleted_at IS NULL AND p.status='active' AND p.deleted_at IS NULL`, targetOwner).Scan(&targetUsed); err != nil {
				return err
			}
			if err := s.Ent.SetUsage(ctx, tx, targetOwner, "pets_created", "current", int64(targetUsed)); err != nil {
				return err
			}
		}
		payload, _ := json.Marshal(map[string]string{
			"from_family_id": t.FromFamilyID, "to_family_id": t.ToFamilyID,
			"dedupe": "transfer:" + t.ID,
		})
		if err := s.Events.RecordAuto(ctx, tx, t.FromFamilyID, t.PetID, "transfer", time.Now().UTC(),
			userID, contracts.SourceAutoTransfer, payload); err != nil {
			return err
		}
		t, err = s.Repo.Decide(ctx, tx, transferID, "accepted", userID)
		if err != nil {
			return err
		}
		if err := platformaudit.Record(ctx, tx, userID, "pet_transfer_accepted", "pet", t.PetID, map[string]any{
			"from_family_id": t.FromFamilyID,
			"to_family_id":   t.ToFamilyID,
			"transfer_id":    t.ID,
		}); err != nil {
			return err
		}
		return db.BindIdempotency(ctx, tx, userID, "transfer-accept:"+transferID, idempotencyKey, "transfer", t.ID)
	})
	if errors.Is(err, errPetMoved) {
		return Transfer{}, httpx.NewAppError(409, "TRANSFER_CONFLICT", "pet is no longer in the source family")
	}
	if errors.Is(err, ErrNotPending) {
		return Transfer{}, httpx.NewAppError(409, "TRANSFER_NOT_PENDING", "transfer is not pending")
	}
	return t, err
}

// cancelOpenRequestsForTransfer prevents a request addressed inside the old
// Family from surviving as an actionable card after the Pet changes context.
// The request and its state-transition event stay in the database as history;
// only the open action is closed.
func cancelOpenRequestsForTransfer(ctx context.Context, tx pgx.Tx, petID, actorID string) error {
	rows, err := tx.Query(ctx, `
		SELECT id::text, state
		FROM care_requests
		WHERE pet_id=$1 AND state IN ('sent','seen') AND deleted_at IS NULL
		FOR UPDATE`, petID)
	if err != nil {
		return err
	}
	requests := make([]struct{ id, state string }, 0)
	for rows.Next() {
		var requestID, fromState string
		if err := rows.Scan(&requestID, &fromState); err != nil {
			rows.Close()
			return err
		}
		requests = append(requests, struct{ id, state string }{id: requestID, state: fromState})
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	for _, request := range requests {
		if _, err := tx.Exec(ctx, `
			UPDATE care_requests
			SET state='cancelled', responded_at=now(), response_note='宠物已转移到其他家庭', updated_at=now()
			WHERE id=$1 AND state IN ('sent','seen') AND deleted_at IS NULL`, request.id); err != nil {
			return err
		}
		payload, _ := json.Marshal(map[string]any{
			"reason": "宠物已转移到其他家庭",
			"source": "pet_transferred",
		})
		if _, err := tx.Exec(ctx, `
			INSERT INTO care_request_events(request_id,actor_user_id,action,from_state,to_state,payload)
			VALUES($1,$2,'cancelled',$3,'cancelled',$4::jsonb)`, request.id, actorID, request.state, payload); err != nil {
			return err
		}
	}
	return nil
}

var errPetMoved = errors.New("pet moved")

func uniqueStrings(values []string) []string {
	out := values[:0]
	for _, value := range values {
		if value == "" || (len(out) > 0 && out[len(out)-1] == value) {
			continue
		}
		out = append(out, value)
	}
	return out
}

func lockUserPair(ctx context.Context, q db.Q, a, b string) error {
	ids := uniqueStrings([]string{a, b})
	sort.Strings(ids)
	for _, id := range ids {
		if _, err := q.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "pet-quota:"+id); err != nil {
			return err
		}
	}
	return nil
}

// Decline 目标圈 owner 拒绝。
func (s *Service) Decline(ctx context.Context, transferID, userID string) (Transfer, error) {
	return s.DeclineWithIdempotency(ctx, transferID, userID, "")
}

func (s *Service) DeclineWithIdempotency(ctx context.Context, transferID, userID, idempotencyKey string) (Transfer, error) {
	t, err := s.Repo.Get(ctx, s.Pool, transferID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Transfer{}, httpx.ErrNotFound("")
	}
	if err != nil {
		return Transfer{}, err
	}
	err = db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		lockedTransfer, lockErr := s.Repo.GetForUpdate(ctx, tx, transferID)
		if lockErr != nil {
			return lockErr
		}
		t = lockedTransfer
		if err := lockFamilyDecision(ctx, tx, t.ToFamilyID); err != nil {
			return err
		}
		if _, err := activeOwnerInTx(ctx, tx, t.ToFamilyID, userID); err != nil {
			return err
		}
		claim, err := db.ClaimIdempotency(ctx, tx, userID, "transfer-decline:"+transferID, idempotencyKey, db.RequestHash(transferID))
		if errors.Is(err, db.ErrIdempotencyKeyReused) {
			return httpx.NewAppError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different request")
		}
		if err != nil {
			return err
		}
		if claim.Replay {
			t, err = s.Repo.Get(ctx, tx, claim.ResourceID)
			return err
		}
		if lockedTransfer.Status != "pending" {
			return ErrNotPending
		}
		var decideErr error
		t, decideErr = s.Repo.Decide(ctx, tx, transferID, "declined", userID)
		if decideErr != nil {
			return decideErr
		}
		if err := platformaudit.Record(ctx, tx, userID, "pet_transfer_declined", "pet", t.PetID, map[string]any{
			"from_family_id": t.FromFamilyID,
			"to_family_id":   t.ToFamilyID,
			"transfer_id":    t.ID,
		}); err != nil {
			return err
		}
		return db.BindIdempotency(ctx, tx, userID, "transfer-decline:"+transferID, idempotencyKey, "transfer", t.ID)
	})
	if errors.Is(err, ErrNotPending) {
		return Transfer{}, httpx.NewAppError(409, "TRANSFER_NOT_PENDING", "transfer is not pending")
	}
	return t, err
}

// Cancel 发起者撤回（PENDING 时）。
func (s *Service) Cancel(ctx context.Context, transferID, userID string) error {
	return s.CancelWithIdempotency(ctx, transferID, userID, "")
}

func (s *Service) CancelWithIdempotency(ctx context.Context, transferID, userID, idempotencyKey string) error {
	t, err := s.Repo.Get(ctx, s.Pool, transferID)
	if errors.Is(err, pgx.ErrNoRows) {
		return httpx.ErrNotFound("")
	}
	if err != nil {
		return err
	}
	err = db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		lockedTransfer, lockErr := s.Repo.GetForUpdate(ctx, tx, transferID)
		if lockErr != nil {
			return lockErr
		}
		t = lockedTransfer
		// 与 Accept 相同的加锁顺序：先宠物行，后家庭行。
		var petLive string
		if err := tx.QueryRow(ctx, `SELECT id::text FROM pets WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, t.PetID).Scan(&petLive); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrNotPending // 宠物已删除时转移已被删宠路径取消；兜底不再可撤回
			}
			return err
		}
		// 撤回授权：创建者本人，且（源圈活跃成员 或 宠物当前主人）。
		// 主人退出家庭、或源圈被注销后仍能自救，pending 不再单边卡死。
		if t.CreatedByUserID == nil || *t.CreatedByUserID != userID {
			return httpx.ErrRoleForbidden()
		}
		authorized := false
		if t.FromFamilyID != "" {
			var role contracts.Role
			memberErr := tx.QueryRow(ctx, `
				SELECT m.role FROM family_memberships m
				JOIN families c ON c.id = m.family_id AND c.deleted_at IS NULL
				WHERE m.family_id = $1 AND m.user_id = $2 AND m.status='active' AND m.ended_at IS NULL AND m.deleted_at IS NULL`,
				t.FromFamilyID, userID).Scan(&role)
			if memberErr != nil && !errors.Is(memberErr, pgx.ErrNoRows) {
				return memberErr
			}
			if memberErr == nil {
				authorized = true
				if err := lockFamilyDecision(ctx, tx, t.FromFamilyID); err != nil {
					return err
				}
			}
		}
		if !authorized {
			var isCurrentOwner bool
			if err := tx.QueryRow(ctx, `
				SELECT EXISTS (
					SELECT 1 FROM pet_ownerships o
					WHERE o.pet_id = $1 AND o.owner_user_id = $2
					  AND o.valid_to IS NULL AND o.deleted_at IS NULL
				)`, t.PetID, userID).Scan(&isCurrentOwner); err != nil {
				return err
			}
			if !isCurrentOwner {
				return httpx.ErrRoleForbidden()
			}
		}
		claim, err := db.ClaimIdempotency(ctx, tx, userID, "transfer-cancel:"+transferID, idempotencyKey, db.RequestHash(transferID))
		if errors.Is(err, db.ErrIdempotencyKeyReused) {
			return httpx.NewAppError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different request")
		}
		if err != nil {
			return err
		}
		if claim.Replay {
			_, err = s.Repo.Get(ctx, tx, claim.ResourceID)
			return err
		}
		if lockedTransfer.Status != "pending" {
			return ErrNotPending
		}
		_, err = s.Repo.Decide(ctx, tx, transferID, "cancelled", userID)
		if err != nil {
			return err
		}
		if err := platformaudit.Record(ctx, tx, userID, "pet_transfer_cancelled", "pet", t.PetID, map[string]any{
			"from_family_id": t.FromFamilyID,
			"to_family_id":   t.ToFamilyID,
			"transfer_id":    t.ID,
		}); err != nil {
			return err
		}
		return db.BindIdempotency(ctx, tx, userID, "transfer-cancel:"+transferID, idempotencyKey, "transfer", t.ID)
	})
	if errors.Is(err, ErrNotPending) {
		return httpx.NewAppError(409, "TRANSFER_NOT_PENDING", "transfer is not pending")
	}
	return err
}

func lockFamilyDecision(ctx context.Context, q db.Q, familyID string) error {
	if familyID == "" {
		return nil
	}
	var id string
	if err := q.QueryRow(ctx,
		`SELECT id FROM families WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, familyID).Scan(&id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return httpx.ErrNotFound("")
		}
		return err
	}
	_, err := q.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, familyID)
	return err
}

func activeRoleInTx(ctx context.Context, q db.Q, familyID, userID string) (contracts.Role, error) {
	var role contracts.Role
	err := q.QueryRow(ctx, `
		SELECT m.role FROM family_memberships m
		JOIN families c ON c.id = m.family_id AND c.deleted_at IS NULL
		WHERE m.family_id = $1 AND m.user_id = $2 AND m.status='active' AND m.ended_at IS NULL AND m.deleted_at IS NULL`, familyID, userID).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", httpx.ErrRoleForbidden()
	}
	return role, err
}

func activeOwnerInTx(ctx context.Context, q db.Q, familyID, userID string) (string, error) {
	role, err := activeRoleInTx(ctx, q, familyID, userID)
	if err != nil {
		return "", err
	}
	if role != contracts.RoleOwner {
		return "", httpx.ErrRoleForbidden()
	}
	return userID, nil
}
