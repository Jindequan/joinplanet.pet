package alerts

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/joinplanet/planet-api/internal/contracts"
)

type Repo struct{ Pool *pgxpool.Pool }

// ActivePets 圈内全部活跃宠物（id/name）。
func (r *Repo) ActivePets(ctx context.Context, q contracts.Q, familyID string) ([]PetInfo, error) {
	rows, err := q.Query(ctx, `
		SELECT id, name FROM pets
		WHERE EXISTS (SELECT 1 FROM family_pet_links fp WHERE fp.family_id = $1 AND fp.pet_id = pets.id AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL) AND pets.status='active' AND pets.deleted_at IS NULL
		ORDER BY created_at`, familyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PetInfo{}
	for rows.Next() {
		var p PetInfo
		if err := rows.Scan(&p.ID, &p.Name); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// EventFeed 圈内全部活跃宠物的指定类型事件（最近优先；id 稳定排序）。
// 有界：预警规则只需要最近 30 天（weight 10 天窗、symptom 14 天窗），
// 全量历史扫描会随家庭史线性变慢。
func (r *Repo) EventFeed(ctx context.Context, q contracts.Q, familyID string, types []string) ([]EventInfo, error) {
	rows, err := q.Query(ctx, `
		SELECT e.id, e.pet_id, e.event_type, e.occurred_at, e.payload
		FROM pet_events e
		JOIN pets p ON p.id = e.pet_id
		WHERE EXISTS (SELECT 1 FROM family_pet_links fp WHERE fp.family_id = $1 AND fp.pet_id = p.id AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL)
		  AND p.status='active' AND p.deleted_at IS NULL AND e.deleted_at IS NULL AND e.event_type = ANY($2)
		  AND e.occurred_at > now() - interval '30 days'
		ORDER BY e.occurred_at DESC, e.id DESC
		LIMIT 5000`, familyID, types)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []EventInfo{}
	for rows.Next() {
		var e EventInfo
		if err := rows.Scan(&e.ID, &e.PetID, &e.Type, &e.OccurredAt, &e.Payload); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// MedicationOccurrenceFeed reads only missed, medication-linked occurrences
// for active medication records. The join through care_plans is intentional:
// care_occurrences keep the execution fact while the plan owns medication_id.
func (r *Repo) MedicationOccurrenceFeed(ctx context.Context, q contracts.Q, familyID string, now time.Time) ([]MedicationOccurrenceInfo, error) {
	rows, err := q.Query(ctx, `
		SELECT co.id, co.pet_id, p.name, m.id, m.name,
		       COALESCE(NULLIF(co.title_snapshot,''), cp.title), co.due_at, co.due_date, co.status
		FROM care_occurrences co
		JOIN care_plans cp ON cp.id = co.care_plan_id AND cp.deleted_at IS NULL
		JOIN medications m ON m.id = cp.medication_id AND m.deleted_at IS NULL
		JOIN pets p ON p.id = co.pet_id AND p.status='active' AND p.deleted_at IS NULL
		WHERE EXISTS (
			SELECT 1 FROM family_pet_links fp
			WHERE fp.family_id=$1 AND fp.pet_id=co.pet_id
			  AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL
		)
		  AND cp.family_id=$1
		  AND co.status='missed' AND co.deleted_at IS NULL
		  AND co.due_at <= $2 AND co.due_at > $2 - interval '30 days'
		  AND m.started_on <= co.due_date
		  AND (m.ended_on IS NULL OR m.ended_on >= co.due_date)
		ORDER BY co.due_at DESC, co.id DESC LIMIT 5000`, familyID, now.UTC())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []MedicationOccurrenceInfo{}
	for rows.Next() {
		var row MedicationOccurrenceInfo
		if err := rows.Scan(&row.ID, &row.PetID, &row.PetName, &row.MedicationID, &row.MedicationName, &row.Title, &row.DueAt, &row.DueDate, &row.Status); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}
