// Package meds：用药管理（B4）。开始/停止自动写 timeline 事件（决策 D6 的桥梁）。
package meds

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/joinplanet/planet-api/internal/platform/db"
)

type Repo struct{ Pool *pgxpool.Pool }

type Medication struct {
	ID              string     `json:"id"`
	PetID           string     `json:"pet_id"`
	Name            string     `json:"name"`
	Dose            string     `json:"dose"`
	Schedule        string     `json:"schedule"`
	StartedOn       time.Time  `json:"started_on"`
	EndedOn         *time.Time `json:"ended_on,omitempty"`
	Note            string     `json:"note"`
	CreatedByUserID string     `json:"created_by_user_id"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

const medCols = `id, pet_id, name, dose, instructions, started_on, ended_on, note, COALESCE(created_by_user_id::text, '') AS created_by_user_id, created_at, updated_at`

func scanMed(scan func(dest ...any) error) (Medication, error) {
	var m Medication
	err := scan(&m.ID, &m.PetID, &m.Name, &m.Dose, &m.Schedule, &m.StartedOn,
		&m.EndedOn, &m.Note, &m.CreatedByUserID, &m.CreatedAt, &m.UpdatedAt)
	return m, err
}

type scanner interface{ Scan(dest ...any) error }

func (r *Repo) Create(ctx context.Context, q db.Q, petID, name, dose, schedule, note, creatorID, startedOn string) (Medication, error) {
	row := q.QueryRow(ctx, `
		INSERT INTO medications (pet_id, name, dose, instructions, note, created_by_user_id, started_on)
		VALUES ($1,$2,$3,$4,$5,$6,$7::date)
		RETURNING `+medCols, petID, name, dose, schedule, note, creatorID, startedOn)
	return scanMed(row.Scan)
}

func (r *Repo) Get(ctx context.Context, q db.Q, id string) (Medication, error) {
	row := q.QueryRow(ctx, `SELECT `+medCols+` FROM medications WHERE id = $1 AND deleted_at IS NULL`, id)
	return scanMed(row.Scan)
}

func (r *Repo) GetForUpdate(ctx context.Context, q db.Q, id string) (Medication, error) {
	row := q.QueryRow(ctx, `SELECT `+medCols+` FROM medications WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, id)
	return scanMed(row.Scan)
}

func (r *Repo) ListByPet(ctx context.Context, q db.Q, petID string) ([]Medication, error) {
	rows, err := q.Query(ctx, `
		SELECT `+medCols+` FROM medications WHERE pet_id = $1 AND deleted_at IS NULL
		ORDER BY ended_on IS NOT NULL, started_on DESC`, petID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Medication{}
	for rows.Next() {
		m, err := scanMed(rows.Scan)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (r *Repo) Update(ctx context.Context, q db.Q, id string, name, dose, schedule, note *string) (Medication, error) {
	row := q.QueryRow(ctx, `
		UPDATE medications SET
			name = COALESCE(NULLIF($2,''), name),
			dose = COALESCE($3, dose),
			instructions = COALESCE($4, instructions),
			note = COALESCE($5, note),
			updated_at = now()
		WHERE id = $1 AND deleted_at IS NULL RETURNING `+medCols, id, name, dose, schedule, note)
	return scanMed(row.Scan)
}

// StopMedication 置 ended_on（仅当尚未停药）；返回 (med, newlyStopped)。
func (r *Repo) StopMedication(ctx context.Context, q db.Q, id, endedOn string) (Medication, bool, error) {
	row := q.QueryRow(ctx, `
		UPDATE medications SET ended_on = $2::date, updated_at = now()
		WHERE id = $1 AND ended_on IS NULL AND deleted_at IS NULL
		RETURNING `+medCols, id, endedOn)
	m, err := scanMed(row.Scan)
	if err != nil {
		return m, false, err
	}
	return m, true, nil
}

func (r *Repo) Delete(ctx context.Context, q db.Q, id string) error {
	tag, err := q.Exec(ctx, `UPDATE medications SET deleted_at = now(), updated_at = now() WHERE id = $1 AND deleted_at IS NULL`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

var _ = errors.Is
