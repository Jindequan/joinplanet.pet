// Package sharing：临时分享（B7）——最小权限、短生命周期、可撤销的只读照护交接凭证。
package sharing

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/joinplanet/planet-api/internal/platform/db"
)

type Repo struct{ Pool *pgxpool.Pool }

type ShareLink struct {
	ID              string     `json:"id"`
	PetID           string     `json:"pet_id"`
	Kind            string     `json:"kind"`
	TokenHash       string     `json:"-"`
	Options         []byte     `json:"options"`
	Snapshot        []byte     `json:"-"`
	CreatedByUserID string     `json:"created_by_user_id"`
	ExpiresAt       time.Time  `json:"expires_at"`
	RevokedAt       *time.Time `json:"revoked_at,omitempty"`
	ViewCount       int        `json:"view_count"`
	LastViewedAt    *time.Time `json:"last_viewed_at,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
}

const shareCols = `id, pet_id, kind, token_hash, options, snapshot, COALESCE(created_by_user_id::text, '') AS created_by_user_id, expires_at, revoked_at, view_count, last_viewed_at, created_at`

func scanShare(scan func(dest ...any) error) (ShareLink, error) {
	var s ShareLink
	err := scan(&s.ID, &s.PetID, &s.Kind, &s.TokenHash, &s.Options, &s.Snapshot, &s.CreatedByUserID,
		&s.ExpiresAt, &s.RevokedAt, &s.ViewCount, &s.LastViewedAt, &s.CreatedAt)
	return s, err
}

func (r *Repo) Insert(ctx context.Context, q db.Q, s ShareLink) (ShareLink, error) {
	row := q.QueryRow(ctx, `
		INSERT INTO share_links (pet_id, kind, token_hash, options, snapshot, created_by_user_id, expires_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		RETURNING `+shareCols,
		s.PetID, s.Kind, s.TokenHash, []byte(orEmpty(s.Options)), []byte(orEmpty(s.Snapshot)), s.CreatedByUserID, s.ExpiresAt)
	return scanShare(row.Scan)
}

func orEmpty(b []byte) string {
	if len(b) == 0 {
		return "{}"
	}
	return string(b)
}

func (r *Repo) ByTokenHash(ctx context.Context, q db.Q, tokenHash string) (ShareLink, error) {
	row := q.QueryRow(ctx, `SELECT `+shareCols+` FROM share_links s
		WHERE s.token_hash = $1 AND s.deleted_at IS NULL
		  AND EXISTS (SELECT 1 FROM pets p WHERE p.id = s.pet_id AND p.deleted_at IS NULL AND p.status <> 'deleted')`, tokenHash)
	return scanShare(row.Scan)
}

func (r *Repo) RotateToken(ctx context.Context, q db.Q, id, tokenHash string) error {
	_, err := q.Exec(ctx, `UPDATE share_links SET token_hash=$2 WHERE id=$1 AND revoked_at IS NULL AND deleted_at IS NULL`, id, tokenHash)
	return err
}

func (r *Repo) ByID(ctx context.Context, q db.Q, id string) (ShareLink, error) {
	row := q.QueryRow(ctx, `SELECT `+shareCols+` FROM share_links WHERE id = $1`, id)
	return scanShare(row.Scan)
}

func (r *Repo) ByIDForUpdate(ctx context.Context, q db.Q, id string) (ShareLink, error) {
	row := q.QueryRow(ctx, `SELECT `+shareCols+` FROM share_links WHERE id = $1 FOR UPDATE`, id)
	return scanShare(row.Scan)
}

func (r *Repo) ListByPet(ctx context.Context, q db.Q, petID string) ([]ShareLink, error) {
	rows, err := q.Query(ctx, `
		SELECT `+shareCols+` FROM share_links
		WHERE pet_id = $1
		  AND revoked_at IS NULL
		  AND expires_at > now()
		  AND deleted_at IS NULL
		ORDER BY created_at DESC`, petID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ShareLink{}
	for rows.Next() {
		s, err := scanShare(rows.Scan)
		if err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r *Repo) Revoke(ctx context.Context, q db.Q, id string) error {
	tag, err := q.Exec(ctx,
		`UPDATE share_links SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		if _, gerr := r.ByID(ctx, q, id); gerr != nil && errors.Is(gerr, pgx.ErrNoRows) {
			return pgx.ErrNoRows
		}
		return errAlreadyRevoked
	}
	return nil
}

func (r *Repo) RevokeAllForPet(ctx context.Context, q db.Q, petID string) error {
	_, err := q.Exec(ctx,
		`UPDATE share_links SET revoked_at = now() WHERE pet_id = $1 AND revoked_at IS NULL`, petID)
	return err
}

type alreadyRevokedErr struct{}

func (alreadyRevokedErr) Error() string { return "already revoked" }

var errAlreadyRevoked = alreadyRevokedErr{}

func (r *Repo) TouchView(ctx context.Context, q db.Q, id string) error {
	_, err := q.Exec(ctx,
		`UPDATE share_links SET view_count = view_count + 1, last_viewed_at = now() WHERE id = $1`, id)
	return err
}
