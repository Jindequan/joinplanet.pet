package tasks

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/joinplanet/planet-api/internal/platform/db"
)

// ScheduleOverride decorates a generated slot without mutating the CareRule.
type ScheduleOverride struct {
	ID                string     `json:"id"`
	CareRuleID        string     `json:"care_rule_id"`
	PetID             string     `json:"pet_id"`
	SlotDate          time.Time  `json:"slot_date"`
	Kind              string     `json:"kind"`
	DueAt             *time.Time `json:"due_at,omitempty"`
	ReplacementPlanID *string    `json:"replacement_plan_id,omitempty"`
	Note              string     `json:"note"`
	CreatedByUserID   string     `json:"created_by_user_id"`
	CreatedAt         time.Time  `json:"created_at"`
}

const overrideCols = `id,care_rule_id,pet_id,slot_date,kind,due_at,replacement_plan_id,note,COALESCE(created_by_user_id::text,''),created_at`

func scanOverride(row pgx.Row) (ScheduleOverride, error) {
	var v ScheduleOverride
	err := row.Scan(&v.ID, &v.CareRuleID, &v.PetID, &v.SlotDate, &v.Kind, &v.DueAt, &v.ReplacementPlanID, &v.Note, &v.CreatedByUserID, &v.CreatedAt)
	return v, err
}

func (r *Repo) GetOverride(ctx context.Context, q db.Q, ruleID string, slotDate time.Time) (ScheduleOverride, error) {
	return scanOverride(q.QueryRow(ctx, `SELECT `+overrideCols+` FROM care_schedule_overrides WHERE care_rule_id=$1 AND slot_date=$2 AND deleted_at IS NULL`, ruleID, slotDate))
}

func (r *Repo) GetOverrideByID(ctx context.Context, q db.Q, id string) (ScheduleOverride, error) {
	return scanOverride(q.QueryRow(ctx, `SELECT `+overrideCols+` FROM care_schedule_overrides WHERE id=$1 AND deleted_at IS NULL`, id))
}

// OverridesForWindow 一次取回窗口内全部 override（键 = ruleID|YYYY-MM-DD），
// 供物化循环消除"规则×天数"的逐日 GetOverride N+1。
func (r *Repo) OverridesForWindow(ctx context.Context, q db.Q, ruleIDs []string, from, to time.Time) (map[string]ScheduleOverride, error) {
	out := map[string]ScheduleOverride{}
	if len(ruleIDs) == 0 {
		return out, nil
	}
	rows, err := q.Query(ctx, `SELECT `+overrideCols+` FROM care_schedule_overrides
		WHERE care_rule_id = ANY($1) AND slot_date >= $2 AND slot_date <= $3 AND deleted_at IS NULL`,
		ruleIDs, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var v ScheduleOverride
		if err := rows.Scan(&v.ID, &v.CareRuleID, &v.PetID, &v.SlotDate, &v.Kind, &v.DueAt, &v.ReplacementPlanID, &v.Note, &v.CreatedByUserID, &v.CreatedAt); err != nil {
			return nil, err
		}
		out[v.CareRuleID+"|"+v.SlotDate.Format("2006-01-02")] = v
	}
	return out, rows.Err()
}

func (r *Repo) UpsertOverride(ctx context.Context, q db.Q, ruleID, petID string, slotDate time.Time, kind string, dueAt *time.Time, replacementPlanID *string, note, userID string) (ScheduleOverride, error) {
	return scanOverride(q.QueryRow(ctx, `
INSERT INTO care_schedule_overrides(care_rule_id,pet_id,slot_date,kind,due_at,replacement_plan_id,note,created_by_user_id)
VALUES($1,$2,$3,$4,$5,$6,$7,$8)
ON CONFLICT(care_rule_id,slot_date) WHERE deleted_at IS NULL
DO UPDATE SET kind=EXCLUDED.kind,due_at=EXCLUDED.due_at,replacement_plan_id=EXCLUDED.replacement_plan_id,note=EXCLUDED.note,updated_at=now()
RETURNING `+overrideCols, ruleID, petID, slotDate, kind, dueAt, replacementPlanID, note, userID))
}

func (r *Repo) GetRule(ctx context.Context, q db.Q, ruleID string) (CareRule, error) {
	return scanRule(q.QueryRow(ctx, `SELECT `+ruleCols+` FROM care_rules r WHERE r.id=$1 AND r.deleted_at IS NULL`, ruleID))
}

func (r *Repo) CloseRuleAt(ctx context.Context, q db.Q, ruleID string, effectiveTo time.Time) error {
	_, err := q.Exec(ctx, `UPDATE care_rules SET effective_to=$2 WHERE id=$1 AND deleted_at IS NULL`, ruleID, effectiveTo)
	return err
}

func (r *Repo) OccurrenceForSlot(ctx context.Context, q db.Q, ruleID string, slotDate time.Time) (Task, error) {
	return scanTask(q.QueryRow(ctx, `SELECT `+occurrenceCols+` FROM care_occurrences co JOIN care_plans ci ON ci.id=co.care_plan_id JOIN care_rules cr ON cr.id=co.care_rule_id JOIN pets p ON p.id=co.pet_id WHERE co.care_rule_id=$1 AND co.due_date=$2 AND co.deleted_at IS NULL`, ruleID, slotDate))
}

func (r *Repo) UpdateOccurrenceDueAt(ctx context.Context, q db.Q, occurrenceID string, dueAt time.Time, localTime *time.Time) error {
	_, err := q.Exec(ctx, `UPDATE care_occurrences SET due_at=$2,local_time=$3 WHERE id=$1 AND status IN('pending','missed') AND deleted_at IS NULL`, occurrenceID, dueAt, localTime)
	return err
}

func (r *Repo) CancelOpenOccurrenceForSlot(ctx context.Context, q db.Q, ruleID string, slotDate time.Time) (string, error) {
	var id string
	err := q.QueryRow(ctx, `
UPDATE care_occurrences SET status='cancelled'
WHERE care_rule_id=$1 AND due_date=$2
  AND status IN('pending','missed') AND deleted_at IS NULL
RETURNING id`, ruleID, slotDate).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return id, err
}
