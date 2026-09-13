package pets

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/joinplanet/planet-api/internal/contracts"
	platformaudit "github.com/joinplanet/planet-api/internal/platform/audit"
	"github.com/joinplanet/planet-api/internal/platform/db"
	"github.com/joinplanet/planet-api/internal/platform/httpx"
)

type Service struct {
	Repo         *Repo
	Pool         *pgxpool.Pool
	Members      contracts.MembershipService
	Ent          contracts.EntitlementService
	CareRequests contracts.CareRequestCloser
	Notifier     contracts.UserNotifier
}

var _ contracts.PetsGuard = (*Service)(nil)

var validSpecies = map[string]bool{"dog": true, "cat": true, "other": true}

// RequirePet 是宠物资源访问的唯一权限路径（ARCHITECTURE §2）：
// 不存在或非成员 → 404（不泄露）；角色不足 → 403；归档宠写 → 409 PET_ARCHIVED。
func (s *Service) RequirePet(ctx context.Context, petID string, needOwner, mutable bool) (contracts.Pet, contracts.Member, error) {
	pet, err := s.Repo.GetPet(ctx, s.Pool, petID)
	if errors.Is(err, pgx.ErrNoRows) {
		return pet, contracts.Member{}, httpx.ErrNotFound("")
	}
	if err != nil {
		return pet, contracts.Member{}, err
	}
	m, err := s.Repo.AccessMemberForWrite(ctx, s.Pool, petID, mustUserID(ctx))
	if errors.Is(err, pgx.ErrNoRows) {
		return pet, m, httpx.ErrNotFound("")
	}
	if err != nil {
		return pet, m, err
	}
	if needOwner && pet.CurrentOwnerUserID != mustUserID(ctx) {
		return pet, m, httpx.ErrRoleForbidden()
	}
	if mutable && (m.Role == contracts.RoleViewer || m.Role == contracts.RoleReadOnly) {
		return pet, m, httpx.ErrRoleForbidden()
	}
	if mutable && pet.Archived() {
		return pet, m, httpx.ErrArchived()
	}
	return pet, m, nil
}

func mustUserID(ctx context.Context) string {
	a, _ := contracts.AuthFrom(ctx)
	return a.UserID
}

// requirePetForWrite is the transaction-local counterpart to RequirePet.
// It locks the pet and live family before checking membership, so a request
// cannot authorize against a stale role/family and then write afterward.
func (s *Service) requirePetForWrite(ctx context.Context, q db.Q, petID, userID string, needOwner, mutable bool) (contracts.Pet, contracts.Member, error) {
	pet, err := s.Repo.LockPetForWrite(ctx, q, petID)
	if errors.Is(err, pgx.ErrNoRows) {
		return pet, contracts.Member{}, httpx.ErrNotFound("")
	}
	if err != nil {
		return pet, contracts.Member{}, err
	}
	m, err := s.Repo.AccessMemberForWrite(ctx, q, petID, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return pet, contracts.Member{}, httpx.ErrNotFound("")
	}
	if err != nil {
		return pet, contracts.Member{}, err
	}
	if needOwner && pet.CurrentOwnerUserID != userID {
		return pet, m, httpx.ErrRoleForbidden()
	}
	if mutable && (m.Role == contracts.RoleViewer || m.Role == contracts.RoleReadOnly) {
		return pet, m, httpx.ErrRoleForbidden()
	}
	if mutable && pet.Archived() {
		return pet, m, httpx.ErrArchived()
	}
	return pet, m, nil
}

// requireLifecycleOwner permits the global Pet owner or an owner of any
// active Family-Pet edge. Family owners can therefore govern the Pet inside
// their organization, while ordinary caregivers and unrelated Pet grants
// cannot perform irreversible lifecycle actions.
func (s *Service) requireLifecycleOwner(ctx context.Context, q db.Q, petID, userID string) (contracts.Pet, error) {
	pet, _, err := s.requirePetForWrite(ctx, q, petID, userID, false, false)
	if err != nil {
		return pet, err
	}
	if pet.CurrentOwnerUserID == userID {
		return pet, nil
	}
	allowed, err := s.Repo.IsFamilyOwnerForPet(ctx, q, petID, userID)
	if err != nil {
		return pet, err
	}
	if !allowed {
		return pet, httpx.ErrRoleForbidden()
	}
	return pet, nil
}

func (s *Service) RequirePetInTx(ctx context.Context, q contracts.Q, petID, userID string, needOwner, mutable bool) (contracts.Pet, contracts.Member, error) {
	return s.requirePetForWrite(ctx, q, petID, userID, needOwner, mutable)
}

// RequirePetRecordInTx separates durable Pet-record writes from care
// execution. A caregiver is intentionally allowed through the ordinary
// mutable gate so they can record/execute care, but identity and medical
// profile changes require owner/editor capability.
func (s *Service) RequirePetRecordInTx(ctx context.Context, q contracts.Q, petID, userID string) (contracts.Pet, contracts.Member, error) {
	pet, member, err := s.requirePetForWrite(ctx, q, petID, userID, false, true)
	if err != nil {
		return pet, member, err
	}
	if member.Role != contracts.RoleOwner && member.Role != contracts.RoleEditor {
		return pet, member, httpx.ErrRoleForbidden()
	}
	return pet, member, nil
}

func validateCreate(name, species, sex string, birthDate *time.Time, weightG *int) error {
	name = strings.TrimSpace(name)
	if name == "" || len(name) > 40 {
		return httpx.ErrValidation("name must be 1-40 chars")
	}
	if !validSpecies[species] {
		return httpx.ErrValidation("species must be dog|cat|other")
	}
	if sex != "" && sex != "male" && sex != "female" {
		return httpx.ErrValidation("sex must be male|female or empty")
	}
	if birthDate != nil && birthDate.After(time.Now().AddDate(0, 0, 1)) {
		return httpx.ErrValidation("birth_date cannot be in the future")
	}
	if weightG != nil && (*weightG <= 0 || *weightG > 200_000) {
		return httpx.ErrValidation("weight_g out of range")
	}
	return nil
}

// Create 建宠：配额按当前 User 的活跃宠物数计算，和 Family 数量无关。
func (s *Service) Create(ctx context.Context, params CreateParams, creatorID string) (contracts.Pet, error) {
	return s.CreateWithIdempotency(ctx, params, creatorID, "")
}

func (s *Service) CreateWithIdempotency(ctx context.Context, params CreateParams, creatorID, idempotencyKey string) (contracts.Pet, error) {
	params.Name = strings.TrimSpace(params.Name)
	if err := validateCreate(params.Name, params.Species, params.Sex, params.BirthDate, params.WeightG); err != nil {
		return contracts.Pet{}, err
	}
	var pet contracts.Pet
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		// 先锁 family 行作为串行化点：空圈无宠物行可锁，曾导致并发超卖。
		if err := s.Repo.LockFamily(ctx, tx, params.FamilyID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return httpx.ErrNotFound("")
			}
			return err
		}
		member, err := s.Repo.ActiveMemberForWrite(ctx, tx, params.FamilyID, creatorID)
		if errors.Is(err, pgx.ErrNoRows) {
			return httpx.ErrNotFound("")
		}
		if err != nil {
			return err
		}
		// Adding a Pet changes the shared Family inventory. Caregivers can
		// execute care, but only the Family owner can add that inventory.
		if member.Role != contracts.RoleOwner {
			return httpx.ErrRoleForbidden()
		}
		scope := "pet:" + params.FamilyID
		claim, err := db.ClaimIdempotency(ctx, tx, creatorID, scope, idempotencyKey,
			db.RequestHash(params.FamilyID, params.Name, params.Species, params.Breed, formatDate(params.BirthDate), params.Sex, boolString(params.Neutered), intString(params.WeightG)))
		if err != nil {
			if errors.Is(err, db.ErrIdempotencyKeyReused) {
				return httpx.NewAppError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different request")
			}
			return err
		}
		if claim.Replay {
			pet, err = s.Repo.GetPet(ctx, tx, claim.ResourceID)
			return err
		}
		if err := s.Repo.LockUserQuota(ctx, tx, creatorID); err != nil {
			return err
		}
		plan, err := s.Ent.UserPlan(ctx, creatorID)
		if err != nil {
			return err
		}
		n, err := s.Repo.CountActivePetsByOwner(ctx, tx, creatorID)
		if err != nil {
			return err
		}
		if n >= plan.Pets {
			return httpx.ErrQuota("QUOTA_PETS_EXCEEDED",
				map[string]any{"pets": n, "pet_max": plan.Pets})
		}
		pet, err = s.Repo.CreatePet(ctx, tx, params, creatorID)
		if err != nil {
			return err
		}
		if err := db.BindIdempotency(ctx, tx, creatorID, scope, idempotencyKey, "pet", pet.ID); err != nil {
			return err
		}
		if err == nil {
			err = s.Repo.LinkFamily(ctx, tx, params.FamilyID, pet.ID, creatorID)
		}
		if err == nil {
			// CreatePet returns before the ACL edge exists; re-read so the
			// response reflects the canonical Family-Pet visibility relation.
			pet, err = s.Repo.GetPet(ctx, tx, pet.ID)
		}
		if err == nil {
			err = s.Ent.SetUsage(ctx, tx, creatorID, "pets_created", "current", int64(n+1))
		}
		if err == nil {
			_, err = s.Repo.UpsertProfile(ctx, tx, pet.ID, creatorID, Profile{})
		}
		if err == nil {
			err = platformaudit.Record(ctx, tx, creatorID, "pet_created", "pet", pet.ID, map[string]any{
				"family_id": params.FamilyID,
				"name":      pet.Name,
			})
		}
		return err
	})
	return pet, err
}

func formatDate(v *time.Time) string {
	if v == nil {
		return ""
	}
	return v.Format("2006-01-02")
}
func boolString(v bool) string {
	if v {
		return "true"
	}
	return "false"
}
func intString(v *int) string {
	if v == nil {
		return ""
	}
	return fmt.Sprintf("%d", *v)
}

func (s *Service) Get(ctx context.Context, petID, userID string) (contracts.Pet, Profile, error) {
	var pet contracts.Pet
	var profile Profile
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		var err error
		var member contracts.Member
		pet, member, err = s.requirePetForWrite(ctx, tx, petID, userID, false, false)
		if err != nil {
			return err
		}
		// The detail endpoint is authenticated, so expose the same effective
		// role used by the guard. Without this, viewers received an empty role
		// and the client rendered mutation controls.
		pet.AccessRole = string(member.Role)
		pet.FamilyRoles, err = s.Repo.FamilyRolesForUser(ctx, tx, petID, userID)
		if err != nil {
			return err
		}
		profile, err = s.Repo.GetProfile(ctx, tx, petID)
		return err
	})
	return pet, profile, httpx.MapDBErr(err)
}

// GetForShare 供分享/导出路径取数（调用方已完成授权；不做成员判定）。
func (s *Service) GetForShare(ctx context.Context, petID string) (contracts.Pet, Profile, error) {
	pet, err := s.Repo.GetPet(ctx, s.Pool, petID)
	if err != nil {
		return pet, Profile{}, httpx.MapDBErr(err)
	}
	profile, err := s.Repo.GetProfile(ctx, s.Pool, petID)
	if err != nil {
		return pet, Profile{}, httpx.MapDBErr(err)
	}
	return pet, profile, nil
}

// Export returns the complete portable pet record to the current owner only.
// An ordinary family/view grant is intentionally insufficient: export contains
// the pet's complete history and is a durable user-data disclosure boundary.
// It deliberately runs as one read transaction so the downloaded file cannot
// combine records from different database snapshots.
func (s *Service) Export(ctx context.Context, petID, userID string) (map[string]any, error) {
	var out map[string]any
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		if _, _, err := s.requirePetForWrite(ctx, tx, petID, userID, true, false); err != nil {
			return err
		}
		var err error
		out, err = s.Repo.Export(ctx, tx, petID)
		return err
	})
	return out, httpx.MapDBErr(err)
}

func (s *Service) ListByFamily(ctx context.Context, familyID, userID string) ([]contracts.Pet, error) {
	var pets []contracts.Pet
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		if err := s.Repo.LockFamily(ctx, tx, familyID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return httpx.ErrNotFound("")
			}
			return err
		}
		if _, err := s.Repo.ActiveMemberForWrite(ctx, tx, familyID, userID); errors.Is(err, pgx.ErrNoRows) {
			return httpx.ErrNotFound("")
		} else if err != nil {
			return err
		}
		var err error
		pets, err = s.Repo.ListByFamily(ctx, tx, familyID)
		return err
	})
	return pets, httpx.MapDBErr(err)
}

func (s *Service) ListAccessibleForUser(ctx context.Context, userID string) ([]contracts.Pet, error) {
	var pets []contracts.Pet
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		var err error
		pets, err = s.Repo.ListAccessibleForUser(ctx, tx, userID)
		return err
	})
	return pets, httpx.MapDBErr(err)
}

func (s *Service) ListDeletedByOwner(ctx context.Context, userID string) ([]contracts.Pet, error) {
	pets, err := s.Repo.ListDeletedByOwner(ctx, s.Pool, userID)
	return pets, httpx.MapDBErr(err)
}

func (s *Service) Restore(ctx context.Context, petID, userID string) (contracts.Pet, error) {
	var pet contracts.Pet
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		if err := s.Repo.LockUserQuota(ctx, tx, userID); err != nil {
			return err
		}
		plan, err := s.Ent.UserPlan(ctx, userID)
		if err != nil {
			return err
		}
		n, err := s.Repo.CountActivePetsByOwner(ctx, tx, userID)
		if err != nil {
			return err
		}
		if n >= plan.Pets {
			return httpx.ErrQuota("QUOTA_PETS_EXCEEDED", map[string]any{"pets": n, "pet_max": plan.Pets})
		}
		pet, err = s.Repo.RestorePet(ctx, tx, petID, userID)
		if errors.Is(err, pgx.ErrNoRows) {
			return httpx.ErrNotFound("")
		}
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `
			UPDATE pet_ownerships
			SET valid_to = NULL, ended_reason = NULL, updated_at = now()
			WHERE pet_id = $1 AND owner_user_id = $2 AND ended_reason = 'pet_deleted' AND valid_to IS NOT NULL AND deleted_at IS NULL`, petID, userID)
		if err != nil {
			return err
		}
		return s.Ent.SetUsage(ctx, tx, userID, "pets_created", "current", int64(n+1))
	})
	return pet, httpx.MapDBErr(err)
}

// ShareWithFamily changes only the ACL edge; it never transfers ownership or
// moves the pet's records. The actor must be the current pet owner and an
// active member of the target family.
func (s *Service) ShareWithFamily(ctx context.Context, petID, userID, familyID string) error {
	return s.ShareWithFamilyWithIdempotency(ctx, petID, userID, familyID, "")
}

func (s *Service) ShareWithFamilyWithIdempotency(ctx context.Context, petID, userID, familyID, idempotencyKey string) error {
	return db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		if _, _, err := s.requirePetForWrite(ctx, tx, petID, userID, true, false); err != nil {
			return err
		}
		// Serialize the target Family lifecycle with the ACL insert. Without
		// this lock a share could validate membership, race Family deletion,
		// and insert a dangling edge into an already-deleted Family.
		if err := s.Repo.LockFamily(ctx, tx, familyID); errors.Is(err, pgx.ErrNoRows) {
			return httpx.ErrNotFound("")
		} else if err != nil {
			return err
		}
		if _, err := s.Repo.ActiveMemberForWrite(ctx, tx, familyID, userID); errors.Is(err, pgx.ErrNoRows) {
			return httpx.ErrNotFound("")
		} else if err != nil {
			return err
		}
		claim, err := db.ClaimIdempotency(ctx, tx, userID, "pet-share-family:"+petID, idempotencyKey, db.RequestHash(familyID))
		if errors.Is(err, db.ErrIdempotencyKeyReused) {
			return httpx.NewAppError(http.StatusConflict, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different request")
		}
		if err != nil {
			return err
		}
		if claim.Replay {
			return nil
		}
		if err := s.Repo.LinkFamily(ctx, tx, familyID, petID, userID); err != nil {
			return err
		}
		if err := platformaudit.Record(ctx, tx, userID, "pet_shared_with_family", "pet", petID, map[string]any{
			"family_id": familyID,
		}); err != nil {
			return err
		}
		return db.BindIdempotency(ctx, tx, userID, "pet-share-family:"+petID, idempotencyKey, "pet_family", petID)
	})
}

func (s *Service) UnshareFromFamily(ctx context.Context, petID, userID, familyID string) error {
	return db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		if _, _, err := s.requirePetForWrite(ctx, tx, petID, userID, true, false); err != nil {
			return err
		}
		if err := s.Repo.UnlinkFamily(ctx, tx, familyID, petID); err != nil {
			return err
		}
		return platformaudit.Record(ctx, tx, userID, "pet_unshared_from_family", "pet", petID, map[string]any{
			"family_id": familyID,
		})
	})
}

// RemoveFromFamily lets a Family owner remove a Pet from that Family without
// deleting the Pet asset or changing its global owner. This is the governance
// operation used by the Family workspace; the Pet owner-only endpoint remains
// responsible for global deletion and sharing changes.
func (s *Service) RemoveFromFamily(ctx context.Context, familyID, petID, userID string) error {
	var cancellationNotices []contracts.CareRequestCancellationNotice
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		if _, err := s.Repo.LockPetForWrite(ctx, tx, petID); errors.Is(err, pgx.ErrNoRows) {
			return httpx.ErrNotFound("")
		} else if err != nil {
			return err
		}
		if err := s.Repo.LockFamily(ctx, tx, familyID); errors.Is(err, pgx.ErrNoRows) {
			return httpx.ErrNotFound("")
		} else if err != nil {
			return err
		}
		member, err := s.Repo.ActiveMemberForWrite(ctx, tx, familyID, userID)
		if errors.Is(err, pgx.ErrNoRows) {
			return httpx.ErrNotFound("")
		}
		if err != nil {
			return err
		}
		if member.Role != contracts.RoleOwner {
			return httpx.ErrRoleForbidden()
		}
		// A Family-owned plan stops being executable as soon as its Pet edge is
		// removed. End only this Family's occurrences; the same Pet may still
		// have an independent care system in another Family.
		occurrenceIDs, err := cancelFamilyPetOpenOccurrences(ctx, tx, familyID, petID)
		if err != nil {
			return err
		}
		if err := s.closeCareRequests(ctx, tx, occurrenceIDs, userID, "宠物已移出家庭", &cancellationNotices); err != nil {
			return err
		}
		if err := s.Repo.UnlinkFamily(ctx, tx, familyID, petID); err != nil {
			return err
		}
		metadata := map[string]any{
			"family_id":             familyID,
			"cancelled_occurrences": len(occurrenceIDs),
		}
		return platformaudit.Record(ctx, tx, userID, "pet_removed_from_family", "pet", petID, metadata)
	})
	if err == nil {
		s.notifyCareRequestCancellations(ctx, cancellationNotices)
	}
	return httpx.MapDBErr(err)
}

func validGrantRole(role contracts.Role) bool {
	return role == contracts.RoleEditor || role == contracts.RoleViewer || role == contracts.RoleReadOnly
}

func (s *Service) GrantAccess(ctx context.Context, petID, ownerID, userID string, role contracts.Role, expiresAt *time.Time) (AccessGrant, error) {
	return s.GrantAccessWithIdempotency(ctx, petID, ownerID, userID, role, expiresAt, "")
}

func (s *Service) GrantAccessWithIdempotency(ctx context.Context, petID, ownerID, userID string, role contracts.Role, expiresAt *time.Time, idempotencyKey string) (AccessGrant, error) {
	if userID == "" || userID == ownerID {
		return AccessGrant{}, httpx.ErrValidation("user_id must be another user")
	}
	if !validGrantRole(role) {
		return AccessGrant{}, httpx.ErrValidation("role must be editor|viewer|read_only")
	}
	if expiresAt != nil && !expiresAt.After(time.Now()) {
		return AccessGrant{}, httpx.ErrValidation("expires_at must be in the future")
	}
	var grant AccessGrant
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		if _, _, err := s.requirePetForWrite(ctx, tx, petID, ownerID, true, false); err != nil {
			return err
		}
		expiresHash := ""
		if expiresAt != nil {
			expiresHash = expiresAt.UTC().Format(time.RFC3339)
		}
		claim, err := db.ClaimIdempotency(ctx, tx, ownerID, "pet-access-grant:"+petID, idempotencyKey, db.RequestHash(userID, string(role), expiresHash))
		if errors.Is(err, db.ErrIdempotencyKeyReused) {
			return httpx.NewAppError(http.StatusConflict, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different request")
		}
		if err != nil {
			return err
		}
		if claim.Replay {
			grants, listErr := s.Repo.ListAccessGrants(ctx, tx, petID)
			if listErr != nil {
				return listErr
			}
			for _, existing := range grants {
				if existing.UserID == userID {
					grant = existing
					return nil
				}
			}
			return httpx.ErrNotFound("access grant not found")
		}
		var exists bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE id = $1 AND status = 'active' AND deleted_at IS NULL)`, userID).Scan(&exists); err != nil {
			return err
		}
		if !exists {
			return httpx.ErrNotFound("user not found")
		}
		grant, err = s.Repo.UpsertAccessGrant(ctx, tx, petID, userID, role, ownerID, expiresAt)
		if err != nil {
			return err
		}
		if err := platformaudit.Record(ctx, tx, ownerID, "pet_access_granted", "pet", petID, map[string]any{
			"user_id": userID,
			"role":    string(role),
		}); err != nil {
			return err
		}
		return db.BindIdempotency(ctx, tx, ownerID, "pet-access-grant:"+petID, idempotencyKey, "access_grant", grant.ID)
	})
	return grant, httpx.MapDBErr(err)
}

func (s *Service) ListAccessGrants(ctx context.Context, petID, ownerID string) ([]AccessGrant, error) {
	var grants []AccessGrant
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		if _, _, err := s.requirePetForWrite(ctx, tx, petID, ownerID, true, false); err != nil {
			return err
		}
		var err error
		grants, err = s.Repo.ListAccessGrants(ctx, tx, petID)
		return err
	})
	return grants, httpx.MapDBErr(err)
}

func (s *Service) RevokeAccess(ctx context.Context, petID, ownerID, grantID string) error {
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		if _, _, err := s.requirePetForWrite(ctx, tx, petID, ownerID, true, false); err != nil {
			return err
		}
		if err := s.Repo.DeleteAccessGrant(ctx, tx, petID, grantID); err != nil {
			return err
		}
		return platformaudit.Record(ctx, tx, ownerID, "pet_access_revoked", "pet", petID, map[string]any{
			"grant_id": grantID,
		})
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return httpx.ErrNotFound("grant not found")
	}
	return httpx.MapDBErr(err)
}

// Update 局部更新 + 乐观锁（version 必传）。
type UpdateParams struct {
	Version      int
	Name         *string
	Species      *string
	Breed        *string
	Sex          *string
	BirthDate    *time.Time
	BirthDateSet bool
	Neutered     *bool
	WeightG      *int
}

func (s *Service) Update(ctx context.Context, petID, userID string, params UpdateParams) (contracts.Pet, error) {
	if params.Species != nil && !validSpecies[*params.Species] {
		return contracts.Pet{}, httpx.ErrValidation("species must be dog|cat|other")
	}
	if params.Sex != nil && *params.Sex != "" && *params.Sex != "male" && *params.Sex != "female" {
		return contracts.Pet{}, httpx.ErrValidation("sex must be male|female or empty")
	}
	if params.Name != nil {
		*params.Name = strings.TrimSpace(*params.Name)
		if len(*params.Name) == 0 || len(*params.Name) > 40 {
			return contracts.Pet{}, httpx.ErrValidation("name too long")
		}
	}
	var pet contracts.Pet
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		if _, _, err := s.RequirePetRecordInTx(ctx, tx, petID, userID); err != nil {
			return err
		}
		var err error
		pet, err = s.Repo.UpdatePet(ctx, tx, petID, params.Version, params.Name, params.Species,
			params.Breed, params.Sex, params.BirthDate, params.BirthDateSet, params.Neutered, params.WeightG)
		if err != nil {
			return err
		}
		return platformaudit.Record(ctx, tx, userID, "pet_updated", "pet", petID, nil)
	})
	if errors.Is(err, errVersionConflict) {
		current, cerr := s.Repo.GetPet(ctx, s.Pool, petID)
		if cerr != nil {
			current = contracts.Pet{}
		}
		return contracts.Pet{}, httpx.ErrVersionConflict(petDTO(current))
	}
	return pet, httpx.MapDBErr(err)
}

// UpdateRecord updates the Pet identity and its caregiver profile in one
// transaction. The mobile editor presents these fields as one record, so a
// successful name change must never be followed by a failed profile write (or
// the reverse) leaving a half-saved record behind.
func (s *Service) UpdateRecord(ctx context.Context, petID, userID string, params UpdateParams, patch ProfilePatch, idempotencyKey, requestHash string) (contracts.Pet, Profile, error) {
	if params.Species != nil && !validSpecies[*params.Species] {
		return contracts.Pet{}, Profile{}, httpx.ErrValidation("species must be dog|cat|other")
	}
	if params.Sex != nil && *params.Sex != "" && *params.Sex != "male" && *params.Sex != "female" {
		return contracts.Pet{}, Profile{}, httpx.ErrValidation("sex must be male|female or empty")
	}
	if params.Name != nil {
		*params.Name = strings.TrimSpace(*params.Name)
		if len(*params.Name) == 0 || len(*params.Name) > 40 {
			return contracts.Pet{}, Profile{}, httpx.ErrValidation("name too long")
		}
	}
	var pet contracts.Pet
	var profile Profile
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		if _, _, err := s.RequirePetRecordInTx(ctx, tx, petID, userID); err != nil {
			return err
		}
		claim, err := db.ClaimIdempotency(ctx, tx, userID, "pet-record:"+petID, idempotencyKey, requestHash)
		if errors.Is(err, db.ErrIdempotencyKeyReused) {
			return httpx.NewAppError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different request")
		}
		if err != nil {
			return err
		}
		if claim.Replay {
			pet, err = s.Repo.GetPet(ctx, tx, petID)
			if err != nil {
				return err
			}
			profile, err = s.Repo.GetProfile(ctx, tx, petID)
			return err
		}
		pet, err = s.Repo.UpdatePet(ctx, tx, petID, params.Version, params.Name, params.Species,
			params.Breed, params.Sex, params.BirthDate, params.BirthDateSet, params.Neutered, params.WeightG)
		if err != nil {
			return err
		}
		profile, err = s.Repo.GetProfile(ctx, tx, petID)
		if err != nil {
			return err
		}
		if patch.Allergies != nil {
			profile.Allergies = *patch.Allergies
		}
		if patch.Conditions != nil {
			profile.Conditions = *patch.Conditions
		}
		if patch.EmergencyContacts != nil {
			profile.EmergencyContacts = *patch.EmergencyContacts
		}
		if patch.MedDecisionMaker != nil {
			profile.MedDecisionMaker = *patch.MedDecisionMaker
		}
		if patch.Notes != nil {
			profile.Notes = *patch.Notes
		}
		if err := validateProfileArrays(profile); err != nil {
			return err
		}
		profile, err = s.Repo.UpsertProfile(ctx, tx, petID, userID, profile)
		if err != nil {
			return err
		}
		if err := platformaudit.Record(ctx, tx, userID, "pet_record_updated", "pet", petID, nil); err != nil {
			return err
		}
		return db.BindIdempotency(ctx, tx, userID, "pet-record:"+petID, idempotencyKey, "pet", petID)
	})
	if errors.Is(err, errVersionConflict) {
		current, cerr := s.Repo.GetPet(ctx, s.Pool, petID)
		if cerr != nil {
			current = contracts.Pet{}
		}
		return contracts.Pet{}, Profile{}, httpx.ErrVersionConflict(petDTO(current))
	}
	return pet, profile, httpx.MapDBErr(err)
}

// Archive 软归档（宠物 owner 或关联 Family owner）：只读、免配额、可导出。
// 归档/恢复/删除是生命周期操作，不属于"照护写入"：授权走 mutable=false，
// 归档态检查在各分支内自行处理。
func (s *Service) Archive(ctx context.Context, petID, userID string, archive bool) (contracts.Pet, error) {
	var pet contracts.Pet
	var cancellationNotices []contracts.CareRequestCancellationNotice
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		var err error
		pet, err = s.requireLifecycleOwner(ctx, tx, petID, userID)
		if err != nil {
			return err
		}
		if archive {
			if pet.Archived() {
				return nil // 幂等
			}
			pet, err = s.Repo.SetArchived(ctx, tx, petID, true)
			if err != nil || pet.CurrentOwnerUserID == "" {
				return err
			}
			// 归档是照护生命周期的终点：未完成的照护项定格为 cancelled
			// （而不是次日烂成 missed 污染纪念宠的完成率），值班交接同步结束。
			occurrenceIDs, err := cancelPetOpenOccurrences(ctx, tx, petID)
			if err != nil {
				return err
			}
			if err := s.closeCareRequests(ctx, tx, occurrenceIDs, userID, "宠物已归档", &cancellationNotices); err != nil {
				return err
			}
			if _, err := tx.Exec(ctx, `
				UPDATE pet_handoffs SET ended_at=now()
				WHERE pet_id=$1 AND ended_at IS NULL`, petID); err != nil {
				return err
			}
			if err = s.Repo.LockUserQuota(ctx, tx, pet.CurrentOwnerUserID); err != nil {
				return err
			}
			n, countErr := s.Repo.CountActivePetsByOwner(ctx, tx, pet.CurrentOwnerUserID)
			if countErr != nil {
				return countErr
			}
			if err := s.Ent.SetUsage(ctx, tx, pet.CurrentOwnerUserID, "pets_created", "current", int64(n)); err != nil {
				return err
			}
			return platformaudit.Record(ctx, tx, userID, "pet_archived", "pet", petID, nil)
		}
		if !pet.Archived() {
			return nil // 幂等
		}
		if pet.CurrentOwnerUserID != userID {
			return httpx.ErrRoleForbidden()
		}
		if err := s.Repo.LockUserQuota(ctx, tx, userID); err != nil {
			return err
		}
		plan, err := s.Ent.UserPlan(ctx, userID)
		if err != nil {
			return err
		}
		n, err := s.Repo.CountActivePetsByOwner(ctx, tx, userID)
		if err != nil {
			return err
		}
		if n >= plan.Pets {
			return httpx.ErrQuota("QUOTA_PETS_EXCEEDED",
				map[string]any{"pets": n, "pet_max": plan.Pets})
		}
		pet, err = s.Repo.SetArchived(ctx, tx, petID, false)
		if err != nil {
			return err
		}
		// 反归档恢复照护：归档时被定格 cancelled 的 occurrence 复位 pending。
		// 只恢复仍活跃计划上的、且没有 skip/move/replace override 的槽位——
		// 停药归档的计划（status=archived）与显式跳过的槽位保持取消。
		if _, err := tx.Exec(ctx, `
			UPDATE care_occurrences co SET status='pending', updated_at=now()
			WHERE co.pet_id=$1 AND co.status='cancelled' AND co.deleted_at IS NULL
			  AND EXISTS (SELECT 1 FROM care_plans ci WHERE ci.id=co.care_plan_id AND ci.status='active' AND ci.deleted_at IS NULL)
			  AND NOT EXISTS (SELECT 1 FROM care_schedule_overrides o
				WHERE o.care_rule_id=co.care_rule_id AND o.slot_date=co.due_date AND o.deleted_at IS NULL)`, petID); err != nil {
			return err
		}
		if err := s.Ent.SetUsage(ctx, tx, userID, "pets_created", "current", int64(n+1)); err != nil {
			return err
		}
		return platformaudit.Record(ctx, tx, userID, "pet_restored", "pet", pet.ID, nil)
	})
	if err == nil {
		s.notifyCareRequestCancellations(ctx, cancellationNotices)
	}
	return pet, httpx.MapDBErr(err)
}

// Delete 软删（宠物 owner 或关联 Family owner，body.confirm 必须等于宠物 ID；
// 恢复窗内仅全局 Pet owner 可 restore）。
// 删除同时取消 pending 转移与值班交接，撤销分享链接。
// 归档宠可删（生命周期操作，非照护写入）。
func (s *Service) Delete(ctx context.Context, petID, userID, confirm string) error {
	if confirm != petID {
		return httpx.ErrValidation("confirm must equal pet id")
	}
	var cancellationNotices []contracts.CareRequestCancellationNotice
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		locked, err := s.requireLifecycleOwner(ctx, tx, petID, userID)
		if err != nil {
			return err
		}
		occurrenceIDs, err := cancelPetOpenOccurrences(ctx, tx, petID)
		if err != nil {
			return err
		}
		if err := s.closeCareRequests(ctx, tx, occurrenceIDs, userID, "宠物已删除", &cancellationNotices); err != nil {
			return err
		}
		if err := s.Repo.DeletePet(ctx, tx, petID); err != nil {
			return err
		}
		// 宠物删除即取消其全部 pending 转移：否则目标圈会看到一只不存在宠物的
		// 邀请（接受还会 500），且 uq_pet_transfers_pending 永久锁死新转移。
		if _, err := tx.Exec(ctx, `
			UPDATE pet_transfers SET status='cancelled', decided_by_user_id=$2, decided_at=now()
			WHERE pet_id=$1 AND status='pending' AND deleted_at IS NULL`, petID, userID); err != nil {
			return err
		}
		// 值班交接同样终结，避免悬挂的 on-duty 状态。
		if _, err := tx.Exec(ctx, `
			UPDATE pet_handoffs SET ended_at=now() WHERE pet_id=$1 AND ended_at IS NULL`, petID); err != nil {
			return err
		}
		if err := platformaudit.Record(ctx, tx, userID, "pet_deleted", "pet", petID, map[string]any{
			"pet_name": locked.Name,
		}); err != nil {
			return err
		}
		if locked.CurrentOwnerUserID == "" {
			return nil
		}
		if err := s.Repo.LockUserQuota(ctx, tx, locked.CurrentOwnerUserID); err != nil {
			return err
		}
		n, err := s.Repo.CountActivePetsByOwner(ctx, tx, locked.CurrentOwnerUserID)
		if err != nil {
			return err
		}
		return s.Ent.SetUsage(ctx, tx, locked.CurrentOwnerUserID, "pets_created", "current", int64(n))
	})
	if err == nil {
		s.notifyCareRequestCancellations(ctx, cancellationNotices)
	}
	return httpx.MapDBErr(err)
}

func cancelPetOpenOccurrences(ctx context.Context, tx pgx.Tx, petID string) ([]string, error) {
	rows, err := tx.Query(ctx, `
		UPDATE care_occurrences SET status='cancelled', updated_at=now()
		WHERE pet_id=$1 AND status IN('pending','missed') AND deleted_at IS NULL
		RETURNING id`, petID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func cancelFamilyPetOpenOccurrences(ctx context.Context, tx pgx.Tx, familyID, petID string) ([]string, error) {
	rows, err := tx.Query(ctx, `
		UPDATE care_occurrences co SET status='cancelled', updated_at=now()
		FROM care_plans cp
		WHERE cp.id=co.care_plan_id AND cp.family_id=$1 AND cp.pet_id=$2
		  AND cp.deleted_at IS NULL
		  AND co.status IN('pending','missed') AND co.deleted_at IS NULL
		RETURNING co.id`, familyID, petID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (s *Service) closeCareRequests(ctx context.Context, tx pgx.Tx, occurrenceIDs []string, userID, reason string, notices *[]contracts.CareRequestCancellationNotice) error {
	if s.CareRequests == nil {
		return nil
	}
	for _, occurrenceID := range occurrenceIDs {
		canceled, err := s.CareRequests.CancelOpenForOccurrence(ctx, tx, occurrenceID, userID, reason)
		if err != nil {
			return err
		}
		*notices = append(*notices, canceled...)
	}
	return nil
}

func (s *Service) notifyCareRequestCancellations(ctx context.Context, notices []contracts.CareRequestCancellationNotice) {
	if s.Notifier == nil {
		return
	}
	for _, notice := range notices {
		_ = s.Notifier.NotifyUserData(ctx, notice.UserID,
			notice.PetName+" 的照护请求已结束", notice.Body, "care_handoff", map[string]string{
				"kind": "care_handoff", "care_request_id": notice.RequestID,
				"family_id": notice.FamilyID, "pet_id": notice.PetID,
			})
	}
}

// ProfilePatch 是档案 PATCH 的存在性感知输入：nil 表示字段未提供，
// 非 nil（包括空数组）表示显式替换该字段。
type ProfilePatch struct {
	Allergies         *json.RawMessage
	Conditions        *json.RawMessage
	EmergencyContacts *json.RawMessage
	MedDecisionMaker  *json.RawMessage
	Notes             *string
}

// UpdateProfile 档案 JSONB 整体替换（应用层校验数组元素结构）。
func (s *Service) UpdateProfile(ctx context.Context, petID, userID string, p Profile) (Profile, error) {
	if err := validateProfileArrays(p); err != nil {
		return Profile{}, err
	}
	var out Profile
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		if _, _, err := s.RequirePetRecordInTx(ctx, tx, petID, userID); err != nil {
			return err
		}
		var err error
		out, err = s.Repo.UpsertProfile(ctx, tx, petID, userID, p)
		return err
	})
	return out, httpx.MapDBErr(err)
}

// UpdateProfilePatch preserves fields omitted by a PATCH caller while still
// allowing explicit empty arrays/strings to clear their values.
func (s *Service) UpdateProfilePatch(ctx context.Context, petID, userID string, patch ProfilePatch) (Profile, error) {
	var out Profile
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		if _, _, err := s.RequirePetRecordInTx(ctx, tx, petID, userID); err != nil {
			return err
		}
		p, err := s.Repo.GetProfile(ctx, tx, petID)
		if err != nil {
			return err
		}
		if patch.Allergies != nil {
			p.Allergies = *patch.Allergies
		}
		if patch.Conditions != nil {
			p.Conditions = *patch.Conditions
		}
		if patch.EmergencyContacts != nil {
			p.EmergencyContacts = *patch.EmergencyContacts
		}
		if patch.MedDecisionMaker != nil {
			p.MedDecisionMaker = *patch.MedDecisionMaker
		}
		if patch.Notes != nil {
			p.Notes = *patch.Notes
		}
		if err := validateProfileArrays(p); err != nil {
			return err
		}
		out, err = s.Repo.UpsertProfile(ctx, tx, petID, userID, p)
		return err
	})
	return out, httpx.MapDBErr(err)
}

// validateProfileArrays：数组字段必须是对象数组，元素字段做宽松校验（防注入任意结构）。
func validateProfileArrays(p Profile) error {
	check := func(raw json.RawMessage, field string, requiredKeys ...string) error {
		if len(raw) == 0 {
			return nil
		}
		var arr []map[string]any
		if err := json.Unmarshal(raw, &arr); err != nil {
			return httpx.ErrValidation(field + " must be an array of objects")
		}
		for _, el := range arr {
			for _, k := range requiredKeys {
				v, ok := el[k]
				if !ok || v == nil {
					return httpx.ErrValidation(field + " element missing field: " + k)
				}
				if s, ok := v.(string); ok && len(s) > 200 {
					return httpx.ErrValidation(field + " field too long: " + k)
				}
			}
		}
		return nil
	}
	if err := check(p.Allergies, "allergies", "name"); err != nil {
		return err
	}
	if err := check(p.Conditions, "conditions", "name"); err != nil {
		return err
	}
	if err := check(p.EmergencyContacts, "emergency_contacts", "name", "phone"); err != nil {
		return err
	}
	if len(p.MedDecisionMaker) > 0 {
		var m map[string]any
		if err := json.Unmarshal(p.MedDecisionMaker, &m); err != nil {
			return httpx.ErrValidation("med_decision_maker must be an object")
		}
	}
	if len(p.Notes) > 5000 {
		return httpx.ErrValidation("notes too long (max 5000)")
	}
	return nil
}
