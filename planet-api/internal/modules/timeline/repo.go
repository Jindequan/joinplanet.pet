package timeline

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/joinplanet/planet-api/internal/platform/db"
)

type Repo struct{ Pool *pgxpool.Pool }

// ActiveFamilyPetMemberRole resolves the event's family edge inside the
// caller-owned transaction. A member of another Family may still see a
// shared Pet's history, but must not mutate an event recorded in this Family.
func (r *Repo) ActiveFamilyPetMemberRole(ctx context.Context, q db.Q, familyID, petID, userID string) (string, error) {
	var role string
	err := q.QueryRow(ctx, `
		SELECT m.role
		FROM family_memberships m
		JOIN families f ON f.id = m.family_id AND f.deleted_at IS NULL
		WHERE m.family_id = $1 AND m.user_id = $2
		  AND m.status = 'active' AND m.ended_at IS NULL AND m.deleted_at IS NULL
		  AND EXISTS (
			SELECT 1 FROM family_pet_links fp
			WHERE fp.family_id = $1 AND fp.pet_id = $3
			  AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL
		  )`, familyID, userID, petID).Scan(&role)
	return role, err
}

type Event struct {
	ID               string     `json:"id"`
	PetID            string     `json:"pet_id"`
	FamilyID         string     `json:"family_id,omitempty"`
	CareOccurrenceID string     `json:"care_occurrence_id,omitempty"`
	Type             string     `json:"type"`
	OccurredAt       time.Time  `json:"occurred_at"`
	RecordedBy       string     `json:"recorded_by"`
	RecordedByName   string     `json:"recorded_by_name,omitempty"`
	RecordedAt       time.Time  `json:"recorded_at"`
	EditedAt         *time.Time `json:"edited_at,omitempty"`
	Payload          []byte     `json:"payload"`
	PayloadVersion   int        `json:"payload_version"`
	Source           string     `json:"source"`
	DedupeKey        string     `json:"-"`
}

const eventCols = `id, pet_id, COALESCE(family_id::text, '') AS family_id, COALESCE(care_occurrence_id::text, '') AS care_occurrence_id, event_type, occurred_at, COALESCE(recorded_by_user_id::text, '') AS recorded_by,
  COALESCE((SELECT NULLIF(display_name, '') FROM users WHERE id = recorded_by_user_id), '') AS recorded_by_name,
  recorded_at, edited_at, payload, payload_version, source, COALESCE(source_key,'')`

func scanEvent(row pgx.Row) (Event, error) {
	var e Event
	err := row.Scan(&e.ID, &e.PetID, &e.FamilyID, &e.CareOccurrenceID, &e.Type, &e.OccurredAt, &e.RecordedBy, &e.RecordedByName, &e.RecordedAt,
		&e.EditedAt, &e.Payload, &e.PayloadVersion, &e.Source, &e.DedupeKey)
	return e, err
}

func scanEvents(rows pgx.Rows) ([]Event, error) {
	defer rows.Close()
	out := []Event{}
	for rows.Next() {
		e, err := scanEvent(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (r *Repo) Insert(ctx context.Context, q db.Q, e Event) (Event, error) {
	row := q.QueryRow(ctx, `
		INSERT INTO pet_events (pet_id, family_id, event_type, occurred_at, recorded_by_user_id, payload, payload_version, source, source_key)
		VALUES ($1,NULLIF($2,'')::uuid,$3,$4,$5,$6,1,$7,$8)
		RETURNING `+eventCols,
		e.PetID, e.FamilyID, e.Type, e.OccurredAt, e.RecordedBy, []byte(orEmpty(e.Payload)), e.Source, nullableDedupe(e.DedupeKey))
	return scanEvent(row)
}

func nullableDedupe(v string) any {
	if v == "" {
		return nil
	}
	return v
}

func (r *Repo) InsertAuto(ctx context.Context, q db.Q, e Event) error {
	_, err := q.Exec(ctx, `
		INSERT INTO pet_events (pet_id, family_id, care_occurrence_id, event_type, occurred_at, recorded_by_user_id, payload, payload_version, source, source_key)
		VALUES ($1,NULLIF($2,'')::uuid,$3,$4,$5,$6,$7,1,$8,$9)
		ON CONFLICT (pet_id, source, event_type, source_key) WHERE source_key IS NOT NULL AND source <> 'user' AND deleted_at IS NULL DO NOTHING`,
		e.PetID, nullableUUID(e.FamilyID), nullableUUID(e.CareOccurrenceID), e.Type, e.OccurredAt, e.RecordedBy, []byte(orEmpty(e.Payload)), e.Source, e.DedupeKey)
	return err
}

func nullableUUID(v string) any {
	if v == "" {
		return nil
	}
	return v
}

func orEmpty(b []byte) string {
	if len(b) == 0 {
		return "{}"
	}
	return string(b)
}

func (r *Repo) Get(ctx context.Context, q db.Q, id string) (Event, error) {
	return scanEvent(q.QueryRow(ctx, `SELECT `+eventCols+` FROM pet_events WHERE id = $1`, id))
}

func (r *Repo) GetForUpdate(ctx context.Context, q db.Q, id string) (Event, error) {
	return scanEvent(q.QueryRow(ctx, `SELECT `+eventCols+` FROM pet_events WHERE id = $1 FOR UPDATE`, id))
}

// AutoExists：同 source+类型+dedupe 的 auto 事件是否已存在（幂等，
// dedupe 由调用方生成：用药=medID:action，转移=transferID）。
func (r *Repo) AutoExists(ctx context.Context, q db.Q, petID, source, eventType, dedupe string) (bool, error) {
	var ok bool
	err := q.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM pet_events
			WHERE pet_id = $1 AND source = $2 AND event_type = $3 AND source_key = $4 AND deleted_at IS NULL
		)`, petID, source, eventType, dedupe).Scan(&ok)
	return ok, err
}

func (r *Repo) ListByPet(ctx context.Context, q db.Q, petID string, before *time.Time, beforeID *string, limit int) ([]Event, error) {
	args := []any{petID}
	sqlText := `SELECT ` + eventCols + ` FROM pet_events WHERE pet_id = $1 AND deleted_at IS NULL`
	if before != nil {
		args = append(args, *before)
		sqlText += ` AND (occurred_at < $2`
		if beforeID != nil {
			args = append(args, *beforeID)
			sqlText += ` OR (occurred_at = $2 AND id < $3::uuid)`
		}
		sqlText += `)`
	}
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	args = append(args, limit)
	sqlText += ` ORDER BY occurred_at DESC, id DESC LIMIT $` + itoa(len(args))
	rows, err := q.Query(ctx, sqlText, args...)
	if err != nil {
		return nil, err
	}
	return scanEvents(rows)
}

// ListByPets is the cursor-safe aggregate counterpart to ListByPet. The
// ordering and tie-breaker are identical, so callers can page one global
// stream without merging per-pet pages in the client.
func (r *Repo) ListByPets(ctx context.Context, q db.Q, petIDs []string, before *time.Time, beforeID *string, limit int) ([]Event, error) {
	if len(petIDs) == 0 {
		return []Event{}, nil
	}
	args := []any{petIDs}
	sqlText := `SELECT ` + eventCols + ` FROM pet_events WHERE pet_id = ANY($1::uuid[]) AND deleted_at IS NULL`
	if before != nil {
		args = append(args, *before)
		sqlText += ` AND (occurred_at < $2`
		if beforeID != nil {
			args = append(args, *beforeID)
			sqlText += ` OR (occurred_at = $2 AND id < $3::uuid)`
		}
		sqlText += `)`
	}
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	args = append(args, limit)
	sqlText += ` ORDER BY occurred_at DESC, id DESC LIMIT $` + itoa(len(args))
	rows, err := q.Query(ctx, sqlText, args...)
	if err != nil {
		return nil, err
	}
	return scanEvents(rows)
}

func itoa(n int) string {
	switch n {
	case 1:
		return "1"
	case 2:
		return "2"
	case 3:
		return "3"
	default:
		return "4"
	}
}

func (r *Repo) Update(ctx context.Context, q db.Q, id string, occurredAt time.Time, payload []byte) (Event, error) {
	row := q.QueryRow(ctx, `
		UPDATE pet_events
		SET occurred_at = $2, payload = $3, edited_at = now()
		WHERE id = $1 AND source = 'user' AND deleted_at IS NULL
		RETURNING `+eventCols, id, occurredAt, []byte(orEmpty(payload)))
	return scanEvent(row)
}

// Delete 拒绝删除 auto 事件（历史事实，只能随用药/宠物删除）。
func (r *Repo) Delete(ctx context.Context, q db.Q, id string) error {
	tag, err := q.Exec(ctx, `UPDATE pet_events SET deleted_at = now() WHERE id = $1 AND source = 'user' AND deleted_at IS NULL`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		// 不存在 or auto 事件
		var source string
		err := q.QueryRow(ctx, `SELECT source FROM pet_events WHERE id = $1 AND deleted_at IS NULL`, id).Scan(&source)
		if errors.Is(err, pgx.ErrNoRows) {
			return pgx.ErrNoRows
		}
		if err == nil && source != SourceUser {
			return errAutoImmutable
		}
		return err
	}
	return nil
}

type autoImmutableErr struct{}

func (autoImmutableErr) Error() string { return "auto event immutable" }

var errAutoImmutable = autoImmutableErr{}
