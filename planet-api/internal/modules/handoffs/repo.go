package handoffs

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/joinplanet/planet-api/internal/platform/db"
)

type Handoff struct {
	ID        string
	PetID     string
	UserID    string
	UserName  string
	StartedAt time.Time
	EndedAt   *time.Time
	CreatedBy string
	CreatedAt time.Time
}

type Repo struct{ Pool *pgxpool.Pool }

func (r *Repo) ActiveByPet(ctx context.Context, q db.Q, petID string) (Handoff, bool, error) {
	row := q.QueryRow(ctx, `
		SELECT h.id::text, h.pet_id::text, h.user_id::text, COALESCE(u.display_name, ''),
		       h.started_at, h.ended_at, h.created_by::text, h.created_at
		FROM pet_handoffs h
		JOIN users u ON u.id = h.user_id
		WHERE h.pet_id = $1 AND h.ended_at IS NULL
		ORDER BY h.started_at DESC
		LIMIT 1`, petID)
	var h Handoff
	err := row.Scan(&h.ID, &h.PetID, &h.UserID, &h.UserName, &h.StartedAt, &h.EndedAt, &h.CreatedBy, &h.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Handoff{}, false, nil
	}
	return h, err == nil, err
}

func (r *Repo) EndActive(ctx context.Context, q db.Q, petID string, endedAt time.Time) error {
	_, err := q.Exec(ctx, `
		UPDATE pet_handoffs SET ended_at = $2
		WHERE pet_id = $1 AND ended_at IS NULL`, petID, endedAt)
	return err
}

// EndForFamilyMember closes only active standing responsibility that depended
// on this family membership. A pet owner or another active caregiver family
// link may still keep the responsibility valid, so governance in one family
// must not revoke an independent relationship elsewhere.
func (r *Repo) EndForFamilyMember(ctx context.Context, q db.Q, familyID, userID string) error {
	_, err := q.Exec(ctx, `
		UPDATE pet_handoffs h SET ended_at = now()
		WHERE h.user_id = $2 AND h.ended_at IS NULL
		  AND EXISTS (
			SELECT 1 FROM family_pet_links removed
			WHERE removed.family_id = $1 AND removed.pet_id = h.pet_id
			  AND removed.unlinked_at IS NULL AND removed.deleted_at IS NULL
		  )
		  AND NOT EXISTS (
			SELECT 1
			FROM family_pet_links other
			JOIN family_memberships m ON m.family_id = other.family_id
			  AND m.user_id = $2
			  AND m.role IN ('owner', 'caregiver')
			  AND m.status = 'active' AND m.ended_at IS NULL AND m.deleted_at IS NULL
			WHERE other.pet_id = h.pet_id
			  AND other.unlinked_at IS NULL AND other.deleted_at IS NULL
		  )
		  AND NOT EXISTS (
			SELECT 1 FROM pet_ownerships o
			WHERE o.pet_id = h.pet_id AND o.owner_user_id = $2
			  AND o.valid_to IS NULL AND o.deleted_at IS NULL
		  )`, familyID, userID)
	return err
}

func (r *Repo) Insert(ctx context.Context, q db.Q, petID, userID, createdBy string, startedAt time.Time) (Handoff, error) {
	row := q.QueryRow(ctx, `
		INSERT INTO pet_handoffs (pet_id, user_id, started_at, created_by)
		VALUES ($1, $2, $3, $4)
		RETURNING id::text, pet_id::text, user_id::text, started_at, ended_at, created_by::text, created_at`,
		petID, userID, startedAt, createdBy)
	var h Handoff
	err := row.Scan(&h.ID, &h.PetID, &h.UserID, &h.StartedAt, &h.EndedAt, &h.CreatedBy, &h.CreatedAt)
	if err != nil {
		return Handoff{}, err
	}
	if err := q.QueryRow(ctx, `SELECT COALESCE(display_name, '') FROM users WHERE id = $1`, userID).Scan(&h.UserName); err != nil {
		return Handoff{}, err
	}
	return h, nil
}

func (r *Repo) ListActiveForFamily(ctx context.Context, familyID string) ([]Handoff, error) {
	rows, err := r.Pool.Query(ctx, `
		SELECT h.id::text, h.pet_id::text, h.user_id::text, COALESCE(u.display_name, ''),
		       h.started_at, h.ended_at, h.created_by::text, h.created_at
		FROM pet_handoffs h
		JOIN users u ON u.id = h.user_id AND u.status = 'active' AND u.deleted_at IS NULL
		JOIN family_pet_links fpl ON fpl.pet_id = h.pet_id
		  AND fpl.family_id = $1
		  AND fpl.unlinked_at IS NULL
		  AND fpl.deleted_at IS NULL
		JOIN pets p ON p.id = h.pet_id AND p.deleted_at IS NULL AND p.status = 'active'
		WHERE h.ended_at IS NULL
		ORDER BY h.started_at DESC`, familyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Handoff
	for rows.Next() {
		var h Handoff
		if err := rows.Scan(&h.ID, &h.PetID, &h.UserID, &h.UserName, &h.StartedAt, &h.EndedAt, &h.CreatedBy, &h.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

type FamilyPet struct {
	ID   string
	Name string
}

func (r *Repo) ListFamilyPets(ctx context.Context, familyID string) ([]FamilyPet, error) {
	rows, err := r.Pool.Query(ctx, `
		SELECT p.id::text, p.name
		FROM family_pet_links fpl
		JOIN pets p ON p.id = fpl.pet_id
		WHERE fpl.family_id = $1
		  AND fpl.unlinked_at IS NULL
		  AND fpl.deleted_at IS NULL
		  AND p.deleted_at IS NULL
		  AND p.status = 'active'
		ORDER BY p.name`, familyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []FamilyPet
	for rows.Next() {
		var p FamilyPet
		if err := rows.Scan(&p.ID, &p.Name); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
