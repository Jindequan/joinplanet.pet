// Package pets：宠物与基础档案（B3）。RequirePet 是全部宠物资源访问的唯一权限路径。
package pets

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/joinplanet/planet-api/internal/contracts"
	"github.com/joinplanet/planet-api/internal/modules/timeline"
	"github.com/joinplanet/planet-api/internal/platform/db"
)

type Repo struct{ Pool *pgxpool.Pool }

type rowScanner interface{ Scan(dest ...any) error }

// Profile 是 contracts.Profile 的模块内别名（跨模块共享的领域类型）。
type Profile = contracts.Profile

const petCols = `id, name, species, breed, birth_date, sex, neutered, weight_g,
	CASE WHEN status = 'archived' THEN updated_at ELSE NULL END, version, created_at, updated_at, COALESCE(created_by_user_id::text, ''),
	COALESCE((SELECT owner_user_id::text FROM pet_ownerships o WHERE o.pet_id = pets.id AND o.valid_to IS NULL AND o.deleted_at IS NULL LIMIT 1), ''),
	COALESCE((SELECT array_agg(fp.family_id::text ORDER BY fp.family_id)
		FROM family_pet_links fp WHERE fp.pet_id = pets.id AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL), ARRAY[]::text[]),
	COALESCE((SELECT fp.family_id::text FROM family_pet_links fp
		WHERE fp.pet_id = pets.id AND fp.relationship_type = 'primary'
		  AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL
		ORDER BY fp.linked_at LIMIT 1), '')`

const exportEventCols = `id, pet_id, COALESCE(family_id::text, '') AS family_id, COALESCE(care_occurrence_id::text, '') AS care_occurrence_id, event_type, occurred_at, COALESCE(recorded_by_user_id::text, '') AS recorded_by,
	recorded_at, edited_at, payload, payload_version, source`

func scanPet(row pgx.Row) (contracts.Pet, error) {
	var p contracts.Pet
	err := row.Scan(&p.ID, &p.Name, &p.Species, &p.Breed, &p.BirthDate,
		&p.Sex, &p.Neutered, &p.WeightG, &p.ArchivedAt, &p.Version, &p.CreatedAt, &p.UpdatedAt,
		&p.CreatedByUserID, &p.CurrentOwnerUserID, &p.FamilyIDs, &p.PrimaryFamilyID)
	return p, err
}

func scanAccessiblePet(row rowScanner) (contracts.Pet, error) {
	var p contracts.Pet
	var familyRolesJSON []byte
	err := row.Scan(&p.ID, &p.Name, &p.Species, &p.Breed, &p.BirthDate,
		&p.Sex, &p.Neutered, &p.WeightG, &p.ArchivedAt, &p.Version, &p.CreatedAt, &p.UpdatedAt,
		&p.CreatedByUserID, &p.CurrentOwnerUserID, &p.FamilyIDs, &p.PrimaryFamilyID, &p.AccessRole, &familyRolesJSON)
	if err == nil && len(familyRolesJSON) > 0 {
		if unmarshalErr := json.Unmarshal(familyRolesJSON, &p.FamilyRoles); unmarshalErr != nil {
			return p, unmarshalErr
		}
	}
	return p, err
}

type CreateParams struct {
	FamilyID  string
	Name      string
	Species   string
	Breed     string
	BirthDate *time.Time
	Sex       string
	Neutered  bool
	WeightG   *int
}

type AccessGrant struct {
	ID        string         `json:"id"`
	PetID     string         `json:"pet_id"`
	UserID    string         `json:"user_id"`
	UserName  string         `json:"user_name"`
	Role      contracts.Role `json:"role"`
	GrantedBy string         `json:"granted_by_user_id,omitempty"`
	ExpiresAt *time.Time     `json:"expires_at,omitempty"`
	CreatedAt time.Time      `json:"created_at"`
}

func scanAccessGrant(scan func(dest ...any) error) (AccessGrant, error) {
	var g AccessGrant
	err := scan(&g.ID, &g.PetID, &g.UserID, &g.UserName, &g.Role, &g.GrantedBy, &g.ExpiresAt, &g.CreatedAt)
	return g, err
}

func (r *Repo) CreatePet(ctx context.Context, q db.Q, p CreateParams, creatorID string) (contracts.Pet, error) {
	row := q.QueryRow(ctx, `
		INSERT INTO pets (name, species, breed, birth_date, sex, neutered, weight_g, created_by_user_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		RETURNING `+petCols,
		p.Name, p.Species, p.Breed, p.BirthDate, p.Sex, p.Neutered, p.WeightG, creatorID)
	pet, err := scanPet(row)
	if err != nil {
		return pet, err
	}
	if _, err := q.Exec(ctx, `INSERT INTO pet_ownerships (pet_id, owner_user_id, created_by_user_id) VALUES ($1,$2,$2)`, pet.ID, creatorID); err != nil {
		return contracts.Pet{}, err
	}
	return r.GetPet(ctx, q, pet.ID)
}

func (r *Repo) GetPet(ctx context.Context, q db.Q, id string) (contracts.Pet, error) {
	return scanPet(q.QueryRow(ctx, `SELECT `+petCols+` FROM pets WHERE id = $1 AND deleted_at IS NULL AND status <> 'deleted'`, id))
}

// LockPetForWrite locks the pet first, then every live Family that currently
// exposes it. Family membership removal/deletion takes the Family row lock;
// rechecking access after these locks means a write cannot authorize against
// a member edge that is concurrently being removed.
func (r *Repo) LockPetForWrite(ctx context.Context, q db.Q, id string) (contracts.Pet, error) {
	pet, err := scanPet(q.QueryRow(ctx, `SELECT `+petCols+` FROM pets WHERE id = $1 AND deleted_at IS NULL AND status <> 'deleted' FOR UPDATE`, id))
	if err != nil {
		return pet, err
	}
	rows, err := q.Query(ctx, `
		SELECT c.id
		FROM families c
		WHERE c.deleted_at IS NULL
		  AND EXISTS (SELECT 1 FROM family_pet_links fp WHERE fp.family_id = c.id AND fp.pet_id = $1 AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL)
		ORDER BY c.id
		FOR UPDATE`, id)
	if err != nil {
		return pet, err
	}
	defer rows.Close()
	for rows.Next() {
		var familyID string
		if err := rows.Scan(&familyID); err != nil {
			return pet, err
		}
	}
	if err := rows.Err(); err != nil {
		return pet, err
	}
	return pet, nil
}

// ActiveMemberForWrite is the transaction-local membership check used after
// the pet/family locks are held. It intentionally does not rely on a pool
// read performed before the mutation transaction.
func (r *Repo) ActiveMemberForWrite(ctx context.Context, q db.Q, familyID, userID string) (contracts.Member, error) {
	var m contracts.Member
	err := q.QueryRow(ctx, `
		SELECT m.user_id, u.email, u.display_name, m.role, m.joined_at
		FROM family_memberships m JOIN users u ON u.id = m.user_id
		JOIN families c ON c.id = m.family_id AND c.deleted_at IS NULL
		WHERE m.family_id = $1 AND m.user_id = $2 AND m.status='active' AND m.ended_at IS NULL AND m.deleted_at IS NULL
		  AND u.status = 'active' AND u.deleted_at IS NULL`,
		familyID, userID).Scan(&m.UserID, &m.Email, &m.DisplayName, &m.Role, &m.JoinedAt)
	return m, err
}

// IsFamilyOwnerForPet is the governance check for lifecycle actions that a
// Family owner is explicitly allowed to perform on that Family's Pet. It is
// evaluated inside the caller's pet/family-locking transaction so a member
// cannot be demoted or unlinked between authorization and mutation.
func (r *Repo) IsFamilyOwnerForPet(ctx context.Context, q db.Q, petID, userID string) (bool, error) {
	var allowed bool
	err := q.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM family_pet_links fp
			JOIN families c ON c.id = fp.family_id AND c.deleted_at IS NULL
			JOIN family_memberships m ON m.family_id = fp.family_id
			WHERE fp.pet_id = $1 AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL
			  AND m.user_id = $2 AND m.role = 'owner' AND m.status = 'active'
			  AND m.ended_at IS NULL AND m.deleted_at IS NULL
		)`, petID, userID).Scan(&allowed)
	return allowed, err
}

// AccessMemberForWrite resolves direct ownership, family visibility and
// temporary vet/sitter grants. Family membership is only an ACL relation.
func (r *Repo) AccessMemberForWrite(ctx context.Context, q db.Q, petID, userID string) (contracts.Member, error) {
	var m contracts.Member
	err := q.QueryRow(ctx, `
		SELECT user_id, email, display_name, role, joined_at FROM (
			SELECT u.id AS user_id, u.email, u.display_name, 'owner'::text AS role, p.created_at AS joined_at, 1 AS priority
			FROM pets p JOIN pet_ownerships o ON o.pet_id=p.id AND o.valid_to IS NULL AND o.deleted_at IS NULL JOIN users u ON u.id = o.owner_user_id AND u.status='active' AND u.deleted_at IS NULL
			WHERE p.id = $1 AND o.owner_user_id = $2 AND p.deleted_at IS NULL AND p.status <> 'deleted'
			UNION ALL
			SELECT cm.user_id, u.email, u.display_name, cm.role::text, cm.joined_at, 2
			FROM family_pet_links fp
			JOIN family_memberships cm ON cm.family_id = fp.family_id AND cm.user_id = $2 AND cm.status='active' AND cm.ended_at IS NULL AND cm.deleted_at IS NULL
			JOIN families c ON c.id = fp.family_id AND c.deleted_at IS NULL
			JOIN users u ON u.id = cm.user_id AND u.status='active' AND u.deleted_at IS NULL
		WHERE fp.pet_id = $1 AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL
			UNION ALL
			SELECT g.user_id, u.email, u.display_name, g.role, g.created_at, 3
			FROM pet_user_delegations g JOIN users u ON u.id = g.user_id AND u.status='active' AND u.deleted_at IS NULL
			WHERE g.pet_id = $1 AND g.user_id = $2
			  AND g.revoked_at IS NULL AND g.deleted_at IS NULL AND (g.expires_at IS NULL OR g.expires_at > now())
		) access ORDER BY priority LIMIT 1`, petID, userID).
		Scan(&m.UserID, &m.Email, &m.DisplayName, &m.Role, &m.JoinedAt)
	return m, err
}

func (r *Repo) FamilyOwnerRow(ctx context.Context, q db.Q, familyID string) (string, error) {
	var id string
	err := q.QueryRow(ctx, `
		SELECT user_id FROM family_memberships
		WHERE family_id = $1 AND role = 'owner' AND status='active' AND ended_at IS NULL AND deleted_at IS NULL
		ORDER BY joined_at LIMIT 1`, familyID).Scan(&id)
	return id, err
}

func (r *Repo) ListByFamily(ctx context.Context, q db.Q, familyID string) ([]contracts.Pet, error) {
	rows, err := q.Query(ctx, `
		SELECT `+petCols+` FROM pets
		WHERE EXISTS (SELECT 1 FROM family_pet_links fp WHERE fp.family_id = $1 AND fp.pet_id = pets.id AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL)
		AND pets.deleted_at IS NULL
		ORDER BY (status = 'archived'), created_at`, familyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []contracts.Pet{}
	for rows.Next() {
		p, err := scanPet(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ListAccessibleForUser is the canonical discovery query for the Pet domain.
// A Pet can be visible through its owner edge, a Family edge, or a temporary
// direct grant; callers must not have to know which ACL path produced it.
func (r *Repo) ListAccessibleForUser(ctx context.Context, q db.Q, userID string) ([]contracts.Pet, error) {
	rows, err := q.Query(ctx, `
		SELECT `+petCols+`,
			CASE
				WHEN EXISTS (SELECT 1 FROM pet_ownerships o WHERE o.pet_id=pets.id AND o.owner_user_id=$1 AND o.valid_to IS NULL AND o.deleted_at IS NULL) THEN 'owner'
				WHEN EXISTS (
					SELECT 1 FROM family_memberships cm
					JOIN families c ON c.id = cm.family_id AND c.deleted_at IS NULL
					JOIN family_pet_links fp ON fp.family_id = cm.family_id AND fp.pet_id = pets.id AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL
					WHERE cm.user_id = $1 AND cm.status='active' AND cm.ended_at IS NULL AND cm.deleted_at IS NULL
				) THEN (
					SELECT cm.role::text FROM family_memberships cm
					JOIN families c ON c.id = cm.family_id AND c.deleted_at IS NULL
					JOIN family_pet_links fp ON fp.family_id = cm.family_id AND fp.pet_id = pets.id AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL
					WHERE cm.user_id = $1 AND cm.status='active' AND cm.ended_at IS NULL AND cm.deleted_at IS NULL
					ORDER BY CASE cm.role::text
						WHEN 'owner' THEN 0 WHEN 'caregiver' THEN 1 WHEN 'editor' THEN 2
						WHEN 'viewer' THEN 3 ELSE 4 END
					LIMIT 1
				)
				ELSE (
					SELECT g.role FROM pet_user_delegations g
					WHERE g.pet_id = pets.id AND g.user_id = $1
					  AND g.revoked_at IS NULL AND g.deleted_at IS NULL AND (g.expires_at IS NULL OR g.expires_at > now())
					LIMIT 1
				)
			END AS access_role,
			COALESCE((
				SELECT jsonb_object_agg(edge.family_id::text, edge.role)
				FROM (
					SELECT cm.family_id, cm.role::text AS role
					FROM family_memberships cm
					JOIN family_pet_links fp ON fp.family_id = cm.family_id AND fp.pet_id = pets.id AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL
					JOIN families c ON c.id = cm.family_id AND c.deleted_at IS NULL
					WHERE cm.user_id = $1 AND cm.status='active' AND cm.ended_at IS NULL AND cm.deleted_at IS NULL
				) edge
			), '{}'::jsonb) AS family_roles
		FROM pets
		WHERE pets.deleted_at IS NULL AND (EXISTS (SELECT 1 FROM pet_ownerships o WHERE o.pet_id=pets.id AND o.owner_user_id=$1 AND o.valid_to IS NULL AND o.deleted_at IS NULL)
		   OR EXISTS (
			SELECT 1 FROM family_pet_links fp
			JOIN family_memberships cm ON cm.family_id = fp.family_id
			JOIN families c ON c.id = fp.family_id AND c.deleted_at IS NULL
			WHERE fp.pet_id = pets.id AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL AND cm.user_id = $1 AND cm.status='active' AND cm.ended_at IS NULL AND cm.deleted_at IS NULL
		   ))
		   OR EXISTS (
			SELECT 1 FROM pet_user_delegations g
			WHERE g.pet_id = pets.id AND g.user_id = $1
			  AND g.revoked_at IS NULL AND g.deleted_at IS NULL AND (g.expires_at IS NULL OR g.expires_at > now())
		   )
		ORDER BY (status = 'archived'), created_at`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []contracts.Pet{}
	for rows.Next() {
		p, err := scanAccessiblePet(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// FamilyRolesForUser returns the role on every live Family-Pet edge. It is
// deliberately separate from AccessMemberForWrite, whose best-role result is
// still useful for unscoped resource authorization but loses Family context.
func (r *Repo) FamilyRolesForUser(ctx context.Context, q db.Q, petID, userID string) (map[string]contracts.Role, error) {
	rows, err := q.Query(ctx, `
		SELECT cm.family_id::text, cm.role::text
		FROM family_memberships cm
		JOIN family_pet_links fp ON fp.family_id = cm.family_id AND fp.pet_id = $1 AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL
		JOIN families c ON c.id = cm.family_id AND c.deleted_at IS NULL
		WHERE cm.user_id = $2 AND cm.status='active' AND cm.ended_at IS NULL AND cm.deleted_at IS NULL`, petID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	roles := map[string]contracts.Role{}
	for rows.Next() {
		var familyID, role string
		if err := rows.Scan(&familyID, &role); err != nil {
			return nil, err
		}
		roles[familyID] = contracts.Role(role)
	}
	return roles, rows.Err()
}

func (r *Repo) LinkFamily(ctx context.Context, q db.Q, familyID, petID, creatorID string) error {
	_, err := q.Exec(ctx, `INSERT INTO family_pet_links (family_id, pet_id, linked_by_user_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, familyID, petID, creatorID)
	return err
}

func (r *Repo) UnlinkFamily(ctx context.Context, q db.Q, familyID, petID string) error {
	_, err := q.Exec(ctx, `UPDATE family_pet_links SET unlinked_at = now(), unlinked_reason='manual' WHERE family_id=$1 AND pet_id=$2 AND unlinked_at IS NULL AND deleted_at IS NULL`, familyID, petID)
	return err
}

func (r *Repo) UpsertAccessGrant(ctx context.Context, q db.Q, petID, userID string, role contracts.Role, grantedBy string, expiresAt *time.Time) (AccessGrant, error) {
	row := q.QueryRow(ctx, `
		INSERT INTO pet_user_delegations (pet_id, user_id, role, capabilities, granted_by_user_id, expires_at)
		VALUES ($1,$2,$3,$4,$5,$6)
		ON CONFLICT (pet_id, user_id) WHERE revoked_at IS NULL AND deleted_at IS NULL DO UPDATE SET
			role = EXCLUDED.role, granted_by_user_id = EXCLUDED.granted_by_user_id,
			expires_at = EXCLUDED.expires_at, revoked_at = NULL, deleted_at = NULL
		RETURNING id, pet_id, user_id,
			(SELECT display_name FROM users WHERE id = pet_user_delegations.user_id),
			role, COALESCE(granted_by_user_id::text,''), expires_at, created_at`,
		petID, userID, role, []string{"view"}, grantedBy, expiresAt)
	return scanAccessGrant(row.Scan)
}

func (r *Repo) ListAccessGrants(ctx context.Context, q db.Q, petID string) ([]AccessGrant, error) {
	rows, err := q.Query(ctx, `
		SELECT g.id, g.pet_id, g.user_id, u.display_name, g.role,
		       COALESCE(g.granted_by_user_id::text,''), g.expires_at, g.created_at
		FROM pet_user_delegations g JOIN users u ON u.id = g.user_id
		WHERE g.pet_id = $1 AND g.deleted_at IS NULL AND g.revoked_at IS NULL
		  AND u.status = 'active' AND u.deleted_at IS NULL
		  AND (g.expires_at IS NULL OR g.expires_at > now())
		ORDER BY g.created_at DESC`, petID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AccessGrant{}
	for rows.Next() {
		g, err := scanAccessGrant(rows.Scan)
		if err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

func (r *Repo) DeleteAccessGrant(ctx context.Context, q db.Q, petID, grantID string) error {
	tag, err := q.Exec(ctx, `UPDATE pet_user_delegations SET revoked_at=now() WHERE pet_id = $1 AND id = $2 AND revoked_at IS NULL AND deleted_at IS NULL`, petID, grantID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// LockFamily 锁定圈行本身（FOR UPDATE），作为配额事务的串行化点。
// 空圈无宠物行可锁，故必须锁 family 行，否则并发建宠会读到 0 而超卖。
func (r *Repo) LockFamily(ctx context.Context, q db.Q, familyID string) error {
	var id string
	return q.QueryRow(ctx, `SELECT id FROM families WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, familyID).Scan(&id)
}

func (r *Repo) LockUserQuota(ctx context.Context, q db.Q, userID string) error {
	_, err := q.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "pet-quota:"+userID)
	return err
}

func (r *Repo) CountActivePetsByOwner(ctx context.Context, q db.Q, userID string) (int, error) {
	var n int
	err := q.QueryRow(ctx, `SELECT count(*) FROM pet_ownerships o JOIN pets p ON p.id=o.pet_id WHERE o.owner_user_id=$1 AND o.valid_to IS NULL AND o.deleted_at IS NULL AND p.status='active' AND p.deleted_at IS NULL`, userID).Scan(&n)
	return n, err
}

// UpdatePet 乐观锁更新（version 不匹配 → 0 行 → 上层 409）。
func (r *Repo) UpdatePet(ctx context.Context, q db.Q, id string, version int,
	name, species, breed, sex *string, birthDate *time.Time, birthDateSet bool, neutered *bool, weightG *int,
) (contracts.Pet, error) {
	row := q.QueryRow(ctx, `
		UPDATE pets SET
			name = COALESCE(NULLIF($3, ''), name),
			species = COALESCE(NULLIF($4, ''), species),
			breed = CASE WHEN $5 THEN $6 ELSE breed END,
			birth_date = CASE WHEN $7 THEN $8 ELSE birth_date END,
			-- sex is NOT NULL in the V1 schema; an explicit empty value clears it
			-- to the schema's empty-string sentinel rather than raising 500.
			sex = CASE WHEN $9 THEN COALESCE($10, '') ELSE sex END,
			neutered = COALESCE($11, neutered),
			weight_g = COALESCE($12, weight_g),
			updated_at = now(), version = version + 1
		WHERE id = $1 AND version = $2
		RETURNING `+petCols,
		id, version, name, species, breed != nil, breed, birthDateSet, birthDate,
		sex != nil, sex, neutered, weightG)
	p, err := scanPet(row)
	if errors.Is(err, pgx.ErrNoRows) {
		// 区分：宠物不存在 vs 版本冲突
		if _, gerr := r.GetPet(ctx, q, id); gerr != nil {
			return p, gerr
		}
		return p, errVersionConflict
	}
	return p, err
}

var errVersionConflict = errors.New("version_conflict")

func (r *Repo) SetArchived(ctx context.Context, q db.Q, id string, archived bool) (contracts.Pet, error) {
	row := q.QueryRow(ctx, `
		UPDATE pets SET status = CASE WHEN $2 THEN 'archived' ELSE 'active' END, updated_at = now(), version = version + 1
		WHERE id = $1 AND deleted_at IS NULL RETURNING `+petCols, id, archived)
	return scanPet(row)
}

func (r *Repo) DeletePet(ctx context.Context, q db.Q, id string) error {
	if _, err := q.Exec(ctx, `UPDATE pet_ownerships SET valid_to=now(),ended_reason='pet_deleted' WHERE pet_id=$1 AND valid_to IS NULL AND deleted_at IS NULL`, id); err != nil {
		return err
	}
	if _, err := q.Exec(ctx, `UPDATE share_links SET revoked_at=now() WHERE pet_id=$1 AND revoked_at IS NULL AND deleted_at IS NULL`, id); err != nil {
		return err
	}
	tag, err := q.Exec(ctx, `UPDATE pets SET status='deleted',deleted_at=now() WHERE id = $1 AND deleted_at IS NULL`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (r *Repo) ListDeletedByOwner(ctx context.Context, q db.Q, ownerID string) ([]contracts.Pet, error) {
	rows, err := q.Query(ctx, `
		SELECT `+petCols+` FROM pets
		WHERE deleted_at IS NOT NULL AND status = 'deleted'
		  AND EXISTS (
			SELECT 1 FROM pet_ownerships o
			WHERE o.pet_id = pets.id AND o.owner_user_id = $1
			  AND o.ended_reason = 'pet_deleted' AND o.valid_to IS NOT NULL AND o.deleted_at IS NULL
		  )
		ORDER BY deleted_at DESC`, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []contracts.Pet{}
	for rows.Next() {
		pet, scanErr := scanPet(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		out = append(out, pet)
	}
	return out, rows.Err()
}

func (r *Repo) RestorePet(ctx context.Context, q db.Q, id, ownerID string) (contracts.Pet, error) {
	row := q.QueryRow(ctx, `
		UPDATE pets SET status = 'active', deleted_at = NULL, updated_at = now(), version = version + 1
		WHERE id = $1 AND status = 'deleted' AND deleted_at IS NOT NULL
		  AND EXISTS (
			SELECT 1 FROM pet_ownerships o
			WHERE o.pet_id = pets.id AND o.owner_user_id = $2
			  AND o.ended_reason = 'pet_deleted' AND o.valid_to IS NOT NULL AND o.deleted_at IS NULL
		  )
		RETURNING `+petCols, id, ownerID)
	return scanPet(row)
}

func (r *Repo) GetProfile(ctx context.Context, q db.Q, petID string) (Profile, error) {
	var p Profile
	err := q.QueryRow(ctx, `
		SELECT allergies, conditions, emergency_contacts, med_decision_maker, notes, updated_at
		FROM pets WHERE id = $1 AND deleted_at IS NULL`, petID).
		Scan(&p.Allergies, &p.Conditions, &p.EmergencyContacts, &p.MedDecisionMaker, &p.Notes, &p.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		// 无行 = 宠物不存在（profile 随宠物创建）
		return p, pgx.ErrNoRows
	}
	return p, err
}

func (r *Repo) UpsertProfile(ctx context.Context, q db.Q, petID, creatorID string, p Profile) (Profile, error) {
	var out Profile
	err := q.QueryRow(ctx, `
		UPDATE pets SET allergies=$2,conditions=$3,emergency_contacts=$4,med_decision_maker=$5,notes=$6,updated_at=now()
		WHERE id=$1 AND deleted_at IS NULL
		RETURNING allergies, conditions, emergency_contacts, med_decision_maker, notes, updated_at`,
		petID, []byte(orDefault(p.Allergies, "[]")), []byte(orDefault(p.Conditions, "[]")),
		[]byte(orDefault(p.EmergencyContacts, "[]")), []byte(p.MedDecisionMaker), p.Notes).
		Scan(&out.Allergies, &out.Conditions, &out.EmergencyContacts, &out.MedDecisionMaker, &out.Notes, &out.UpdatedAt)
	return out, err
}

func orDefault(b json.RawMessage, def string) string {
	if len(b) == 0 {
		return def
	}
	return string(b)
}

// RecalculateWeight 从最新 weight 事件重建冗余字段。查询和更新必须在
// 调用方事务内完成，这样新增/编辑/删除事件不会出现半更新状态。
func (r *Repo) RecalculateWeight(ctx context.Context, q db.Q, petID string) error {
	var weightG *int
	err := q.QueryRow(ctx, `
		SELECT CASE
			WHEN payload->>'weight_g' ~ '^[0-9]+$' THEN (payload->>'weight_g')::int
			ELSE NULL
		END
		FROM pet_events
		WHERE pet_id = $1 AND event_type = 'weight' AND deleted_at IS NULL
		ORDER BY occurred_at DESC, id DESC
		LIMIT 1`, petID).Scan(&weightG)
	if errors.Is(err, pgx.ErrNoRows) {
		weightG = nil
	} else if err != nil {
		return err
	}
	_, err = q.Exec(ctx, `UPDATE pets SET weight_g = $2, updated_at = now() WHERE id = $1`, petID, weightG)
	return err
}

// Export returns the complete V1 pet record in one caller-owned read
// transaction. Secrets (session tokens, share tokens and token hashes) are
// intentionally excluded; share metadata is not part of the pet's portable
// health record.
func (r *Repo) Export(ctx context.Context, q db.Q, petID string) (map[string]any, error) {
	pet, err := r.GetPet(ctx, q, petID)
	if err != nil {
		return nil, err
	}
	profile, err := r.GetProfile(ctx, q, petID)
	if err != nil {
		return nil, err
	}

	medications := []map[string]any{}
	medRows, err := q.Query(ctx, `
		SELECT id, pet_id, name, dose, instructions, started_on, ended_on, note,
		       COALESCE(created_by_user_id::text, ''), created_at, updated_at
		FROM medications WHERE pet_id = $1 AND deleted_at IS NULL
		ORDER BY started_on, created_at, id`, petID)
	if err != nil {
		return nil, err
	}
	for medRows.Next() {
		var id, pid, name, dose, schedule, note, createdBy string
		var startedOn time.Time
		var endedOn *time.Time
		var createdAt, updatedAt time.Time
		if err := medRows.Scan(&id, &pid, &name, &dose, &schedule, &startedOn, &endedOn, &note,
			&createdBy, &createdAt, &updatedAt); err != nil {
			medRows.Close()
			return nil, err
		}
		m := map[string]any{
			"id": id, "pet_id": pid, "name": name, "dose": dose, "schedule": schedule,
			"started_on": startedOn.Format("2006-01-02"), "note": note,
			"created_by_user_id": createdBy, "created_at": createdAt, "updated_at": updatedAt,
		}
		if endedOn != nil {
			m["ended_on"] = endedOn.Format("2006-01-02")
		}
		medications = append(medications, m)
	}
	if err := medRows.Err(); err != nil {
		medRows.Close()
		return nil, err
	}
	medRows.Close()

	tasks := []map[string]any{}
	taskRows, err := q.Query(ctx, `
		SELECT co.id, co.pet_id, ci.id, co.care_rule_id,
		       COALESCE(NULLIF(co.type_snapshot,''),ci.type), COALESCE(NULLIF(co.title_snapshot,''),ci.title), COALESCE(NULLIF(co.description_snapshot,''),ci.description), COALESCE(co.frequency_snapshot,cr.schedule), co.local_time,
		       co.timezone, COALESCE(ci.created_by_user_id::text, ''),
		       CASE WHEN ci.status = 'archived' THEN ci.updated_at ELSE NULL END,
		       ci.created_at, co.due_at, co.due_date, co.status,
		       co.assigned_to_user_id, co.completed_by_user_id, co.completed_at
		FROM care_occurrences co
		JOIN care_plans ci ON ci.id = co.care_plan_id
		JOIN care_rules cr ON cr.id = co.care_rule_id
		JOIN pets p ON p.id = co.pet_id
		WHERE co.pet_id = $1 AND co.deleted_at IS NULL
		ORDER BY co.due_date, co.due_at, ci.title, co.id`, petID)
	if err != nil {
		return nil, err
	}
	for taskRows.Next() {
		var id, pid, itemID, ruleID, itemType, title, description, timezone, createdBy, status string
		var schedule []byte
		var timeOfDay *time.Time
		var archivedAt *time.Time
		var createdAt, dueAt, dueDate time.Time
		var assignedTo, completedBy *string
		var completedAt *time.Time
		if err := taskRows.Scan(&id, &pid, &itemID, &ruleID, &itemType, &title, &description,
			&schedule, &timeOfDay, &timezone, &createdBy, &archivedAt, &createdAt, &dueAt, &dueDate,
			&status, &assignedTo, &completedBy, &completedAt); err != nil {
			taskRows.Close()
			return nil, err
		}
		t := map[string]any{
			"id": id, "pet_id": pid, "care_plan_id": itemID, "care_rule_id": ruleID,
			"type": itemType, "title": title, "description": description, "timezone": timezone,
			"schedule": json.RawMessage(orDefault(schedule, "{}")), "created_by_user_id": createdBy,
			"created_at": createdAt, "due_at": dueAt, "due_date": dueDate.Format("2006-01-02"), "status": status,
		}
		if timeOfDay != nil {
			t["time_of_day"] = timeOfDay.Format("15:04")
		}
		if archivedAt != nil {
			t["archived_at"] = archivedAt
		}
		if assignedTo != nil {
			t["assigned_to_user_id"] = *assignedTo
		}
		if completedBy != nil {
			t["completed_by_user_id"] = *completedBy
		}
		if completedAt != nil {
			t["completed_at"] = completedAt
		}
		tasks = append(tasks, t)
	}
	if err := taskRows.Err(); err != nil {
		taskRows.Close()
		return nil, err
	}
	taskRows.Close()

	taskLogs := []map[string]any{}
	logRows, err := q.Query(ctx, `
		SELECT co.id, co.id, co.due_date, co.status,
		       COALESCE(co.completed_by_user_id::text, ''), co.completed_at, co.note
		FROM care_occurrences co
		WHERE co.pet_id = $1 AND co.status IN ('completed', 'skipped') AND co.deleted_at IS NULL
		ORDER BY co.due_date, co.completed_at, co.id`, petID)
	if err != nil {
		return nil, err
	}
	for logRows.Next() {
		var id, taskID, status, doneBy, note string
		var logDate time.Time
		var doneAt *time.Time
		if err := logRows.Scan(&id, &taskID, &logDate, &status, &doneBy, &doneAt, &note); err != nil {
			logRows.Close()
			return nil, err
		}
		taskLogs = append(taskLogs, map[string]any{
			"id": id, "task_id": taskID, "log_date": logDate.Format("2006-01-02"),
			"status": status, "done_by": doneBy, "done_at": doneAt, "note": note,
		})
	}
	if err := logRows.Err(); err != nil {
		logRows.Close()
		return nil, err
	}
	logRows.Close()

	eventRows, err := q.Query(ctx, `SELECT `+exportEventCols+` FROM pet_events
		WHERE pet_id = $1 AND deleted_at IS NULL ORDER BY occurred_at DESC, id DESC`, petID)
	if err != nil {
		return nil, err
	}
	defer eventRows.Close()
	events := []timeline.Event{}
	for eventRows.Next() {
		var event timeline.Event
		if err := eventRows.Scan(&event.ID, &event.PetID, &event.FamilyID, &event.CareOccurrenceID, &event.Type, &event.OccurredAt,
			&event.RecordedBy, &event.RecordedAt, &event.EditedAt, &event.Payload,
			&event.PayloadVersion, &event.Source); err != nil {
			return nil, err
		}
		events = append(events, event)
	}
	if err := eventRows.Err(); err != nil {
		return nil, err
	}
	return map[string]any{
		"export_version": 1,
		"exported_at":    time.Now().UTC(),
		"pet":            petDTO(pet),
		"profile":        profileDTO(profile),
		"medications":    medications,
		"tasks":          tasks,
		"task_logs":      taskLogs,
		"timeline":       events,
	}, nil
}
