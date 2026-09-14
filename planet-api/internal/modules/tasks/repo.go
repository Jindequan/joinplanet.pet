package tasks

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/joinplanet/planet-api/internal/contracts"
	"github.com/joinplanet/planet-api/internal/platform/db"
)

type Repo struct{ Pool *pgxpool.Pool }

// CountActivePlanPets returns the number of active Pets that have at least
// one active care plan. It is used by the activation read model so the app
// does not issue one care-plan request per Pet.
func (r *Repo) CountActivePlanPets(ctx context.Context, q db.Q, petIDs []string) (int, error) {
	if len(petIDs) == 0 {
		return 0, nil
	}
	var count int
	err := q.QueryRow(ctx, `
		SELECT count(DISTINCT pet_id)
		FROM care_plans
		WHERE pet_id = ANY($1::uuid[])
		  AND status = 'active' AND deleted_at IS NULL`, petIDs).Scan(&count)
	return count, err
}

// CarePlan is the durable intention. Its schedule is projected from the
// current CareRule; it is never stored redundantly on the plan.
type CarePlan struct {
	ID              string     `json:"id"`
	PetID           string     `json:"pet_id"`
	FamilyID        string     `json:"family_id,omitempty"`
	MedicationID    string     `json:"medication_id,omitempty"`
	Type            string     `json:"type"`
	Title           string     `json:"title"`
	Description     string     `json:"description"`
	Status          string     `json:"status"`
	Frequency       []byte     `json:"frequency"`
	StartDate       time.Time  `json:"start_date"`
	EndDate         *time.Time `json:"end_date,omitempty"`
	TimeOfDay       *time.Time `json:"time_of_day,omitempty"`
	Timezone        string     `json:"timezone"`
	CreatedByUserID string     `json:"created_by_user_id"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
	ArchivedAt      *time.Time `json:"archived_at,omitempty"`
}
type CareRule struct {
	ID         string     `json:"id"`
	CarePlanID string     `json:"care_plan_id"`
	Frequency  []byte     `json:"frequency"`
	StartDate  time.Time  `json:"start_date"`
	EndDate    *time.Time `json:"end_date,omitempty"`
	TimeOfDay  *time.Time `json:"time_of_day,omitempty"`
	Timezone   string     `json:"timezone"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
}
type CareAssignment struct {
	CarePlanID      string    `json:"care_plan_id"`
	UserID          string    `json:"user_id"`
	UserName        string    `json:"user_name"`
	Role            string    `json:"role"`
	Priority        int       `json:"priority"`
	CreatedByUserID string    `json:"created_by_user_id,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
}
type Task struct {
	ID              string     `json:"id"`
	PetID           string     `json:"pet_id"`
	FamilyID        string     `json:"family_id,omitempty"`
	CarePlanID      string     `json:"care_plan_id"`
	CareRuleID      string     `json:"care_rule_id"`
	MedicationID    string     `json:"medication_id,omitempty"`
	Type            string     `json:"type"`
	Title           string     `json:"title"`
	Description     string     `json:"description,omitempty"`
	Schedule        []byte     `json:"schedule"`
	TimeOfDay       *time.Time `json:"time_of_day,omitempty"`
	Timezone        string     `json:"timezone"`
	CreatedByUserID string     `json:"created_by_user_id"`
	ArchivedAt      *time.Time `json:"archived_at,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
	DueAt           *time.Time `json:"due_at,omitempty"`
	DueDate         *time.Time `json:"due_date,omitempty"`
	Status          string     `json:"status,omitempty"`
	AssignedTo      *string    `json:"assigned_to_user_id,omitempty"`
	CompletedBy     *string    `json:"completed_by_user_id,omitempty"`
	CompletedAt     *time.Time `json:"completed_at,omitempty"`
}
type TaskLog struct {
	ID      string    `json:"id"`
	TaskID  string    `json:"task_id"`
	LogDate time.Time `json:"log_date"`
	Status  string    `json:"status"`
	DoneBy  string    `json:"done_by"`
	DoneAt  time.Time `json:"done_at"`
	Note    string    `json:"note"`
}
type ruleCandidate struct {
	ItemID      string
	RuleID      string
	PetID       string
	FamilyID    string
	Title       string
	Description string
	Type        string
	ItemStatus  string
	ItemCreated time.Time
	Frequency   []byte
	StartDate   time.Time
	EndDate     *time.Time
	TimeOfDay   *time.Time
	Timezone    string
	AssignedTo  *string
}
type rowScanner interface{ Scan(dest ...any) error }

// Rule effective dates are civil dates in the rule's timezone. PostgreSQL's
// CURRENT_DATE uses the database session timezone (usually UTC), which can
// select yesterday's rule for a Family already on the next local day.
const ruleCivilToday = `((CURRENT_TIMESTAMP AT TIME ZONE COALESCE(NULLIF(r.timezone,''),'UTC'))::date)`
const selectedRuleCivilToday = `((CURRENT_TIMESTAMP AT TIME ZONE COALESCE(NULLIF(cr.timezone,''),'UTC'))::date)`

// currentRuleJoin prefers the rule effective today, then the nearest future
// rule (so a scheduled plan does not return an empty/default rule before its
// start date), and finally the most recent expired rule for historical reads.
const currentRuleJoin = `LEFT JOIN LATERAL (SELECT r.* FROM care_rules r WHERE r.care_plan_id=ci.id AND r.deleted_at IS NULL ORDER BY CASE WHEN r.effective_from<=` + ruleCivilToday + ` AND (r.effective_to IS NULL OR r.effective_to>=` + ruleCivilToday + `) THEN 0 WHEN r.effective_from>` + ruleCivilToday + ` THEN 1 ELSE 2 END, CASE WHEN r.effective_from>` + ruleCivilToday + ` THEN r.effective_from END ASC, r.effective_from DESC,r.created_at DESC LIMIT 1) cr ON true`
const planCols = `ci.id,ci.pet_id,COALESCE(ci.family_id::text,''),COALESCE(ci.medication_id::text,''),ci.type,ci.title,ci.description,ci.status,COALESCE(cr.schedule,'{}'::jsonb),COALESCE(cr.effective_from,` + selectedRuleCivilToday + `),cr.effective_to,cr.local_time,COALESCE(NULLIF(cr.timezone,''),'UTC'),COALESCE(ci.created_by_user_id::text,''),ci.created_at,ci.updated_at`
const ruleCols = `r.id,r.care_plan_id,r.schedule,r.effective_from,r.effective_to,r.local_time,r.timezone,r.created_at,r.updated_at`
const ruleReturnCols = `id,care_plan_id,schedule,effective_from,effective_to,local_time,timezone,created_at,updated_at`
const occurrenceCols = `co.id,co.pet_id,COALESCE(ci.family_id::text,''),co.care_plan_id,co.care_rule_id,COALESCE(ci.medication_id::text,''),COALESCE(NULLIF(co.type_snapshot,''),ci.type),COALESCE(NULLIF(co.title_snapshot,''),ci.title),COALESCE(NULLIF(co.description_snapshot,''),ci.description),COALESCE(co.frequency_snapshot,cr.schedule),co.local_time,co.timezone,COALESCE(ci.created_by_user_id::text,''),CASE WHEN ci.status='archived' THEN ci.updated_at ELSE NULL END,ci.created_at,co.due_at,co.due_date,co.status,co.assigned_to_user_id,co.completed_by_user_id,co.completed_at`

func scanItem(row pgx.Row) (CarePlan, error) {
	var v CarePlan
	err := row.Scan(&v.ID, &v.PetID, &v.FamilyID, &v.MedicationID, &v.Type, &v.Title, &v.Description, &v.Status, &v.Frequency, &v.StartDate, &v.EndDate, &v.TimeOfDay, &v.Timezone, &v.CreatedByUserID, &v.CreatedAt, &v.UpdatedAt)
	if v.Status == "archived" {
		v.ArchivedAt = &v.UpdatedAt
	}
	return v, err
}
func scanRule(row pgx.Row) (CareRule, error) {
	var v CareRule
	err := row.Scan(&v.ID, &v.CarePlanID, &v.Frequency, &v.StartDate, &v.EndDate, &v.TimeOfDay, &v.Timezone, &v.CreatedAt, &v.UpdatedAt)
	return v, err
}
func scanTask(row rowScanner) (Task, error) {
	var v Task
	err := row.Scan(&v.ID, &v.PetID, &v.FamilyID, &v.CarePlanID, &v.CareRuleID, &v.MedicationID, &v.Type, &v.Title, &v.Description, &v.Schedule, &v.TimeOfDay, &v.Timezone, &v.CreatedByUserID, &v.ArchivedAt, &v.CreatedAt, &v.DueAt, &v.DueDate, &v.Status, &v.AssignedTo, &v.CompletedBy, &v.CompletedAt)
	return v, err
}
func scanPlanQuery(q db.Q, ctx context.Context, sql string, args ...any) (CarePlan, error) {
	return scanItem(q.QueryRow(ctx, sql, args...))
}

func (r *Repo) CreateItem(ctx context.Context, q db.Q, petID, familyID, itemType, title, description, medicationID, userID string) (CarePlan, error) {
	var med any
	if medicationID != "" {
		med = medicationID
	}
	var family any
	if familyID != "" {
		family = familyID
	}
	return scanPlanQuery(q, ctx, `WITH inserted AS (INSERT INTO care_plans(pet_id,family_id,type,title,description,medication_id,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *) SELECT `+planCols+` FROM inserted ci `+currentRuleJoin, petID, family, itemType, title, description, med, userID)
}

type scheduleFields struct {
	V      int    `json:"v"`
	Kind   string `json:"kind"`
	Days   []int  `json:"days,omitempty"`
	Day    int    `json:"day,omitempty"`
	EveryN int    `json:"every_n,omitempty"`
}

func ruleFields(raw []byte) (scheduleFields, error) {
	var s scheduleFields
	err := json.Unmarshal(raw, &s)
	return s, err
}
func nullableInt(v int) any {
	if v == 0 {
		return nil
	}
	return v
}
func nullableDays(v []int) any {
	if len(v) == 0 {
		return nil
	}
	x := make([]int16, len(v))
	for i := range v {
		x[i] = int16(v[i])
	}
	return x
}
func (r *Repo) CreateRule(ctx context.Context, q db.Q, itemID string, frequency []byte, startDate time.Time, endDate *time.Time, timeOfDay *time.Time, timezone, userID string) (CareRule, error) {
	s, err := ruleFields(frequency)
	if err != nil {
		return CareRule{}, err
	}
	var local any
	if timeOfDay != nil {
		local = *timeOfDay
	}
	return scanRule(q.QueryRow(ctx, `INSERT INTO care_rules(care_plan_id,frequency,schedule,interval_days,weekdays,day_of_month,local_time,timezone,effective_from,effective_to,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING `+ruleReturnCols, itemID, s.Kind, frequency, nullableInt(s.EveryN), nullableDays(s.Days), nullableInt(s.Day), local, timezone, startDate, endDate, userID))
}
func (r *Repo) Assign(ctx context.Context, q db.Q, itemID, userID, role, creatorID string) error {
	_, err := q.Exec(ctx, `INSERT INTO care_plan_assignments(care_plan_id,user_id,role,priority,created_by_user_id)
		VALUES($1,$2,$3,CASE WHEN $3='owner' THEN 0 ELSE COALESCE((SELECT MAX(priority)+1 FROM care_plan_assignments WHERE care_plan_id=$1 AND role='helper' AND deleted_at IS NULL),1) END,$4)
		ON CONFLICT (care_plan_id,user_id) WHERE deleted_at IS NULL
		DO UPDATE SET role=EXCLUDED.role,deleted_at=NULL,updated_at=now()`, itemID, userID, role, creatorID)
	return err
}
func (r *Repo) ListAssignments(ctx context.Context, q db.Q, itemID string) ([]CareAssignment, error) {
	rows, err := q.Query(ctx, `SELECT a.care_plan_id,a.user_id,COALESCE(u.display_name,u.email),a.role,a.priority,COALESCE(a.created_by_user_id::text,''),a.created_at FROM care_plan_assignments a JOIN users u ON u.id=a.user_id AND u.status='active' AND u.deleted_at IS NULL WHERE a.care_plan_id=$1 AND a.deleted_at IS NULL ORDER BY(a.role='owner') DESC,a.priority,a.created_at,a.user_id`, itemID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []CareAssignment
	for rows.Next() {
		var v CareAssignment
		if err := rows.Scan(&v.CarePlanID, &v.UserID, &v.UserName, &v.Role, &v.Priority, &v.CreatedByUserID, &v.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// MoveAssignment swaps one helper with its adjacent helper. The owner is not
// part of the fallback order and cannot be moved.
func (r *Repo) MoveAssignment(ctx context.Context, q db.Q, itemID, userID, direction string) error {
	rows, err := q.Query(ctx, `SELECT user_id::text,priority FROM care_plan_assignments WHERE care_plan_id=$1 AND role='helper' AND deleted_at IS NULL ORDER BY priority,created_at,user_id FOR UPDATE`, itemID)
	if err != nil {
		return err
	}
	defer rows.Close()
	type helper struct {
		userID   string
		priority int
	}
	var helpers []helper
	for rows.Next() {
		var item helper
		if err := rows.Scan(&item.userID, &item.priority); err != nil {
			return err
		}
		helpers = append(helpers, item)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	index := -1
	for i := range helpers {
		if helpers[i].userID == userID {
			index = i
			break
		}
	}
	if index < 0 {
		return pgx.ErrNoRows
	}
	target := index - 1
	if direction == "down" {
		target = index + 1
	}
	if target < 0 || target >= len(helpers) {
		return nil
	}
	currentPriority := helpers[index].priority
	otherPriority := helpers[target].priority
	if _, err := q.Exec(ctx, `UPDATE care_plan_assignments SET priority=$3,updated_at=now() WHERE care_plan_id=$1 AND user_id=$2 AND deleted_at IS NULL`, itemID, helpers[index].userID, otherPriority); err != nil {
		return err
	}
	_, err = q.Exec(ctx, `UPDATE care_plan_assignments SET priority=$3,updated_at=now() WHERE care_plan_id=$1 AND user_id=$2 AND deleted_at IS NULL`, itemID, helpers[target].userID, currentPriority)
	return err
}

// UserCanParticipateInPet is deliberately narrower than discovery access.
// Viewers may see a Pet and its history, but they must never become a
// standing care-plan assignee. Direct ownership still grants participation;
// family access only does so for owner/caregiver memberships.
func (r *Repo) UserCanParticipateInPet(ctx context.Context, q db.Q, petID, userID string) (bool, error) {
	var ok bool
	err := q.QueryRow(ctx, `SELECT EXISTS(
		SELECT 1 FROM pet_ownerships o
		JOIN users u ON u.id=o.owner_user_id AND u.status='active' AND u.deleted_at IS NULL
		WHERE o.pet_id=$1 AND o.owner_user_id=$2 AND o.valid_to IS NULL AND o.deleted_at IS NULL
		UNION ALL
		SELECT 1 FROM family_pet_links fp
		JOIN family_memberships m ON m.family_id=fp.family_id AND m.user_id=$2
		JOIN families f ON f.id=fp.family_id AND f.deleted_at IS NULL
		JOIN users u ON u.id=m.user_id AND u.status='active' AND u.deleted_at IS NULL
		WHERE fp.pet_id=$1 AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL
		  AND m.role IN ('owner','caregiver') AND m.status='active' AND m.ended_at IS NULL AND m.deleted_at IS NULL
		UNION ALL
		SELECT 1 FROM pet_user_delegations d
		JOIN users u ON u.id=d.user_id AND u.status='active' AND u.deleted_at IS NULL
		WHERE d.pet_id=$1 AND d.user_id=$2 AND d.revoked_at IS NULL AND d.deleted_at IS NULL
		  AND(d.expires_at IS NULL OR d.expires_at>now())
	)`, petID, userID).Scan(&ok)
	return ok, err
}
func (r *Repo) DeleteAssignment(ctx context.Context, q db.Q, itemID, userID string) (string, error) {
	var role string
	err := q.QueryRow(ctx, `UPDATE care_plan_assignments SET deleted_at=now() WHERE care_plan_id=$1 AND user_id=$2 AND deleted_at IS NULL RETURNING role`, itemID, userID).Scan(&role)
	return role, err
}
func (r *Repo) GetItem(ctx context.Context, q db.Q, itemID string) (CarePlan, error) {
	return scanPlanQuery(q, ctx, `SELECT `+planCols+` FROM care_plans ci `+currentRuleJoin+` WHERE ci.id=$1 AND ci.deleted_at IS NULL`, itemID)
}
func (r *Repo) ResolveItem(ctx context.Context, q db.Q, id string) (CarePlan, error) {
	return scanPlanQuery(q, ctx, `SELECT `+planCols+` FROM care_plans ci `+currentRuleJoin+` WHERE ci.deleted_at IS NULL AND(ci.id=$1 OR EXISTS(SELECT 1 FROM care_occurrences co WHERE co.id=$1 AND co.care_plan_id=ci.id AND co.deleted_at IS NULL)) ORDER BY CASE WHEN ci.id=$1 THEN 0 ELSE 1 END LIMIT 1`, id)
}
func (r *Repo) GetRuleByItem(ctx context.Context, q db.Q, itemID string) (CareRule, error) {
	return scanRule(q.QueryRow(ctx, `SELECT `+ruleCols+` FROM care_rules r WHERE r.care_plan_id=$1 AND r.deleted_at IS NULL ORDER BY CASE WHEN r.effective_from<=`+ruleCivilToday+` AND (r.effective_to IS NULL OR r.effective_to>=`+ruleCivilToday+`) THEN 0 WHEN r.effective_from>`+ruleCivilToday+` THEN 1 ELSE 2 END, CASE WHEN r.effective_from>`+ruleCivilToday+` THEN r.effective_from END ASC, r.effective_from DESC,r.created_at DESC LIMIT 1`, itemID))
}
func (r *Repo) GetFirstTaskForRule(ctx context.Context, q db.Q, ruleID string) (Task, error) {
	return scanTask(q.QueryRow(ctx, `SELECT `+occurrenceCols+` FROM care_occurrences co JOIN care_plans ci ON ci.id=co.care_plan_id JOIN care_rules cr ON cr.id=co.care_rule_id JOIN pets p ON p.id=co.pet_id WHERE co.care_rule_id=$1 AND co.deleted_at IS NULL ORDER BY co.due_date,co.due_at LIMIT 1`, ruleID))
}
func (r *Repo) UpdateItem(ctx context.Context, q db.Q, itemID, itemType, title, description string, descriptionSet bool, status string) (CarePlan, error) {
	if _, err := q.Exec(ctx, `UPDATE care_plans SET type=COALESCE(NULLIF($2,''),type),title=COALESCE(NULLIF($3,''),title),description=CASE WHEN $4 THEN $5 ELSE description END,status=COALESCE(NULLIF($6,''),status) WHERE id=$1 AND deleted_at IS NULL`, itemID, itemType, title, descriptionSet, description, status); err != nil {
		return CarePlan{}, err
	}
	return r.GetItem(ctx, q, itemID)
}
func (r *Repo) UpdateRule(ctx context.Context, q db.Q, ruleID string, frequency []byte, timeOfDay *time.Time, timeOfDaySet bool, startDate time.Time, endDate *time.Time) (CareRule, error) {
	var old []byte
	var oldLocal *time.Time
	err := q.QueryRow(ctx, `SELECT schedule,local_time FROM care_rules WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, ruleID).Scan(&old, &oldLocal)
	if err != nil {
		return CareRule{}, err
	}
	if len(frequency) == 0 {
		frequency = old
	}
	s, err := ruleFields(frequency)
	if err != nil {
		return CareRule{}, err
	}
	var local any = oldLocal
	if timeOfDaySet {
		local = timeOfDay
	}
	return scanRule(q.QueryRow(ctx, `UPDATE care_rules SET frequency=$2,schedule=$3,interval_days=$4,weekdays=$5,day_of_month=$6,local_time=$7,effective_from=COALESCE($8,effective_from),effective_to=$9 WHERE id=$1 RETURNING `+ruleReturnCols, ruleID, s.Kind, frequency, nullableInt(s.EveryN), nullableDays(s.Days), nullableInt(s.Day), local, nullableDate(startDate), endDate))
}
func nullableDate(d time.Time) *time.Time {
	if d.IsZero() {
		return nil
	}
	return &d
}
func (r *Repo) DeleteOpenTasksForRuleFromDate(ctx context.Context, q db.Q, ruleID string, fromDate time.Time) ([]string, error) {
	rows, err := q.Query(ctx, `
UPDATE care_occurrences
SET status='cancelled', deleted_at=now()
WHERE care_rule_id=$1 AND due_date>=$2
  AND status IN('pending','missed') AND deleted_at IS NULL
RETURNING id`, ruleID, fromDate)
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
func (r *Repo) DeleteItem(ctx context.Context, q db.Q, itemID string) error {
	tag, err := q.Exec(ctx, `UPDATE care_plans SET status='archived',deleted_at=now() WHERE id=$1 AND deleted_at IS NULL`, itemID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func planTaskSelect() string {
	// The care-plan screen needs the next executable occurrence, not only the
	// recurring rule. The service materializes a short preview window before
	// this query, so this remains a cheap indexed lookup and also respects
	// completed/ skipped occurrences.
	return `SELECT ci.id,ci.pet_id,COALESCE(ci.family_id::text,''),ci.id,COALESCE(cr.id::text,''),COALESCE(ci.medication_id::text,''),ci.type,ci.title,ci.description,COALESCE(cr.schedule,'{}'::jsonb),cr.local_time,COALESCE(NULLIF(cr.timezone,''),'UTC'),COALESCE(ci.created_by_user_id::text,''),CASE WHEN ci.status='archived' THEN ci.updated_at ELSE NULL END,ci.created_at,next.due_at,next.due_date,ci.status,next.assigned_to_user_id,NULL::uuid,NULL::timestamptz`
}
func (r *Repo) ListByPet(ctx context.Context, q db.Q, petID, familyID string, includeArchived bool) ([]Task, error) {
	filter := "ci.deleted_at IS NULL AND ci.status<>'archived'"
	if includeArchived {
		filter = "ci.deleted_at IS NULL"
	}
	rows, err := q.Query(ctx, planTaskSelect()+` FROM care_plans ci LEFT JOIN LATERAL(SELECT r.* FROM care_rules r WHERE r.care_plan_id=ci.id AND r.deleted_at IS NULL ORDER BY CASE WHEN r.effective_from<=`+ruleCivilToday+` AND (r.effective_to IS NULL OR r.effective_to>=`+ruleCivilToday+`) THEN 0 WHEN r.effective_from>`+ruleCivilToday+` THEN 1 ELSE 2 END, CASE WHEN r.effective_from>`+ruleCivilToday+` THEN r.effective_from END ASC, r.effective_from DESC,r.created_at DESC LIMIT 1)cr ON true LEFT JOIN LATERAL(SELECT co.due_at,co.due_date,co.assigned_to_user_id FROM care_occurrences co WHERE co.care_plan_id=ci.id AND co.deleted_at IS NULL AND co.status IN('pending','missed') AND co.due_date>=((CURRENT_TIMESTAMP AT TIME ZONE COALESCE(NULLIF(cr.timezone,''),'UTC'))::date) ORDER BY co.due_date,co.due_at NULLS LAST LIMIT 1)next ON true WHERE ci.pet_id=$1 AND ($2::text='' OR ci.family_id=NULLIF($2::text,'')::uuid) AND `+filter+` ORDER BY(ci.status='archived'),cr.local_time NULLS LAST,ci.title`, petID, familyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Task
	for rows.Next() {
		v, err := scanTask(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
func (r *Repo) listCandidates(ctx context.Context, q db.Q, where string, args ...any) ([]ruleCandidate, error) {
	// Do not filter on effective_to here. Materialization is requested for a
	// particular civil date and materializeCandidate applies both start/end
	// bounds. Filtering against CURRENT_DATE would hide rules that ended
	// recently and make valid historical backfill impossible.
	rows, err := q.Query(ctx, `SELECT ci.id,cr.id,ci.pet_id,COALESCE(ci.family_id::text,''),ci.title,ci.description,ci.type,ci.status,ci.created_at,cr.schedule,cr.effective_from,cr.effective_to,cr.local_time,cr.timezone,a.user_id FROM care_plans ci JOIN care_rules cr ON cr.care_plan_id=ci.id AND cr.deleted_at IS NULL LEFT JOIN LATERAL(SELECT ca.user_id FROM care_plan_assignments ca JOIN users au ON au.id=ca.user_id AND au.status='active' AND au.deleted_at IS NULL WHERE ca.care_plan_id=ci.id AND ca.deleted_at IS NULL ORDER BY(ca.role='owner') DESC,ca.created_at LIMIT 1)a ON true WHERE `+where+` AND ci.status='active' AND ci.deleted_at IS NULL ORDER BY ci.title`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ruleCandidate
	for rows.Next() {
		var v ruleCandidate
		if err := rows.Scan(&v.ItemID, &v.RuleID, &v.PetID, &v.FamilyID, &v.Title, &v.Description, &v.Type, &v.ItemStatus, &v.ItemCreated, &v.Frequency, &v.StartDate, &v.EndDate, &v.TimeOfDay, &v.Timezone, &v.AssignedTo); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
func (r *Repo) ListRulesForFamily(ctx context.Context, q db.Q, familyID string) ([]ruleCandidate, error) {
	return r.listCandidates(ctx, q, `EXISTS(SELECT 1 FROM family_pet_links fp JOIN pets p ON p.id=fp.pet_id WHERE fp.family_id=$1 AND fp.pet_id=ci.pet_id AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL AND p.status='active') AND ci.family_id=$1`, familyID)
}
func (r *Repo) ListRulesForPet(ctx context.Context, q db.Q, petID string) ([]ruleCandidate, error) {
	return r.listCandidates(ctx, q, `ci.pet_id=$1 AND EXISTS(SELECT 1 FROM pets p WHERE p.id=ci.pet_id AND p.status='active')`, petID)
}
func (r *Repo) ListRulesForPetInFamily(ctx context.Context, q db.Q, petID, familyID string) ([]ruleCandidate, error) {
	return r.listCandidates(ctx, q, `ci.pet_id=$1 AND ci.family_id=$2 AND EXISTS(SELECT 1 FROM family_pet_links fp WHERE fp.family_id=$2 AND fp.pet_id=ci.pet_id AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL) AND EXISTS(SELECT 1 FROM pets p WHERE p.id=ci.pet_id AND p.status='active')`, petID, familyID)
}

func (r *Repo) UserCanParticipateInFamily(ctx context.Context, q db.Q, familyID, userID string) (bool, error) {
	var allowed bool
	err := q.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM family_memberships WHERE family_id=$1 AND user_id=$2 AND role IN ('owner','caregiver') AND status='active' AND ended_at IS NULL AND deleted_at IS NULL)`, familyID, userID).Scan(&allowed)
	return allowed, err
}

func (r *Repo) UserAssignedToPlan(ctx context.Context, q db.Q, planID, userID string) (bool, error) {
	var assigned bool
	err := q.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM care_plan_assignments WHERE care_plan_id=$1 AND user_id=$2 AND deleted_at IS NULL)`, planID, userID).Scan(&assigned)
	return assigned, err
}
func (r *Repo) RuleForTask(ctx context.Context, q db.Q, taskID string) (CareRule, error) {
	return scanRule(q.QueryRow(ctx, `SELECT `+ruleCols+` FROM care_rules r JOIN care_occurrences co ON co.care_rule_id=r.id WHERE co.id=$1`, taskID))
}
func coalesceTime(v *time.Time) any { return v }
func (r *Repo) MaterializeTask(ctx context.Context, q db.Q, c ruleCandidate, dueAt, dueDate time.Time) (Task, error) {
	var id string
	err := q.QueryRow(ctx, `INSERT INTO care_occurrences(care_plan_id,care_rule_id,pet_id,occurrence_key,due_date,due_at,local_time,timezone,assigned_to_user_id,rule_snapshot,type_snapshot,title_snapshot,description_snapshot,frequency_snapshot) VALUES($1,$2,$3,$2::uuid::text||':'||$4::date,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(care_rule_id,due_date) WHERE deleted_at IS NULL DO UPDATE SET assigned_to_user_id=COALESCE(care_occurrences.assigned_to_user_id,EXCLUDED.assigned_to_user_id),deleted_at=NULL,due_at=CASE WHEN care_occurrences.status IN('pending','missed') THEN EXCLUDED.due_at ELSE care_occurrences.due_at END,status=CASE WHEN care_occurrences.status IN('completed','skipped','cancelled') THEN care_occurrences.status ELSE care_occurrences.status END RETURNING id`, c.ItemID, c.RuleID, c.PetID, dueDate, dueAt, coalesceTime(c.TimeOfDay), c.Timezone, c.AssignedTo, c.Frequency, c.Type, c.Title, c.Description, c.Frequency).Scan(&id)
	if err != nil {
		return Task{}, err
	}
	return r.Get(ctx, q, id)
}

func (r *Repo) todayRows(ctx context.Context, q db.Q, where string, args ...any) ([]TodayRow, error) {
	rows, err := q.Query(ctx, `SELECT `+occurrenceCols+`,latest_request.id,latest_request.state,latest_request.from_user_id,latest_request.from_user_name,latest_request.target_user_id,latest_request.target_user_name,latest_request.updated_at,continuation.target_user_id,continuation.target_user_name,p.name,assigned_user.display_name,CASE WHEN co.status IN('completed','skipped') THEN co.id ELSE NULL END,CASE WHEN co.status IN('completed','skipped') THEN co.id ELSE NULL END,CASE WHEN co.status IN('completed','skipped') THEN co.due_date ELSE NULL END,CASE WHEN co.status IN('completed','skipped') THEN co.status ELSE NULL END,co.completed_by_user_id,co.completed_at,co.note,u.display_name FROM care_occurrences co JOIN care_plans ci ON ci.id=co.care_plan_id JOIN care_rules cr ON cr.id=co.care_rule_id JOIN pets p ON p.id=co.pet_id LEFT JOIN users u ON u.id=co.completed_by_user_id LEFT JOIN users assigned_user ON assigned_user.id=co.assigned_to_user_id LEFT JOIN LATERAL (SELECT r.id::text,r.state,r.from_user_id::text,COALESCE(from_user.display_name,from_user.email) AS from_user_name,r.target_user_id::text,COALESCE(target_user.display_name,target_user.email) AS target_user_name,r.updated_at FROM care_requests r JOIN users from_user ON from_user.id=r.from_user_id JOIN users target_user ON target_user.id=r.target_user_id WHERE r.occurrence_id=co.id AND r.deleted_at IS NULL ORDER BY r.created_at DESC, r.id DESC LIMIT 1) latest_request ON true LEFT JOIN LATERAL (SELECT nr.target_user_id::text,COALESCE(next_target_user.display_name,next_target_user.email) AS target_user_name FROM care_requests nr JOIN users next_target_user ON next_target_user.id=nr.target_user_id WHERE nr.supersedes_request_id::text=latest_request.id AND nr.deleted_at IS NULL ORDER BY nr.created_at DESC,nr.id DESC LIMIT 1) continuation ON true WHERE `+where+` AND NOT EXISTS(SELECT 1 FROM care_schedule_overrides o WHERE o.care_rule_id=co.care_rule_id AND o.slot_date=co.due_date AND o.kind IN('skip','replace') AND o.deleted_at IS NULL) AND co.status<>'cancelled' ORDER BY p.name,co.due_at,ci.title`, args...)
	if err != nil {
		return nil, err
	}
	return scanTodayRows(rows)
}
func (r *Repo) TodayRows(ctx context.Context, q db.Q, familyID string, dueDate time.Time) ([]TodayRow, error) {
	return r.todayRows(ctx, q, `ci.family_id=$1 AND EXISTS(SELECT 1 FROM family_pet_links fp WHERE fp.family_id=$1 AND fp.pet_id=co.pet_id AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL) AND co.due_date=$2 AND ci.status='active' AND ci.deleted_at IS NULL AND p.status='active' AND co.deleted_at IS NULL`, familyID, dueDate)
}
func (r *Repo) TodayRowsInWindow(ctx context.Context, q db.Q, familyID string, start, end time.Time) ([]TodayRow, error) {
	return r.todayRows(ctx, q, `ci.family_id=$1 AND EXISTS(SELECT 1 FROM family_pet_links fp WHERE fp.family_id=$1 AND fp.pet_id=co.pet_id AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL) AND co.due_at>=$2 AND co.due_at<$3 AND ci.status='active' AND ci.deleted_at IS NULL AND p.status='active' AND co.deleted_at IS NULL`, familyID, start.UTC(), end.UTC())
}
func (r *Repo) MarkMissedBeforeFamily(ctx context.Context, q db.Q, familyID string, before time.Time) error {
	_, err := q.Exec(ctx, `UPDATE care_occurrences co SET status='missed' WHERE co.status='pending' AND co.due_date<$2 AND co.deleted_at IS NULL AND EXISTS(SELECT 1 FROM family_pet_links fp WHERE fp.family_id=$1 AND fp.pet_id=co.pet_id AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL)`, familyID, before)
	return err
}
func (r *Repo) MarkMissedBeforeFamilyAt(ctx context.Context, q db.Q, familyID string, before time.Time) error {
	// 只扫活跃宠物：归档宠的 pending 已在归档时定格 cancelled，防御性排除。
	_, err := q.Exec(ctx, `UPDATE care_occurrences co SET status='missed' FROM pets p, care_plans cp
		WHERE p.id = co.pet_id AND p.status='active' AND p.deleted_at IS NULL
		  AND cp.family_id=$1 AND cp.status='active' AND cp.deleted_at IS NULL
		  AND co.id IN (SELECT co2.id FROM care_occurrences co2 WHERE co2.status='pending' AND co2.due_at<$2 AND co2.deleted_at IS NULL
		    AND EXISTS(SELECT 1 FROM family_pet_links fp WHERE fp.family_id=$1 AND fp.pet_id=co2.pet_id AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL)
		    AND co2.care_plan_id=cp.id)`,
		familyID, before.UTC())
	return err
}
func (r *Repo) MarkMissedBeforePet(ctx context.Context, q db.Q, petID string, before time.Time) error {
	_, err := q.Exec(ctx, `UPDATE care_occurrences SET status='missed' WHERE pet_id=$1 AND status='pending' AND due_date<$2 AND deleted_at IS NULL`, petID, before)
	return err
}
func (r *Repo) MarkMissedBeforePetAt(ctx context.Context, q db.Q, petID string, before time.Time) error {
	// 只扫活跃宠物（与家庭口径一致；归档宠 pending 已在归档时定格 cancelled）。
	_, err := q.Exec(ctx, `UPDATE care_occurrences co SET status='missed' FROM pets p
		WHERE p.id=co.pet_id AND p.status='active' AND p.deleted_at IS NULL
		  AND co.pet_id=$1 AND co.status='pending' AND co.due_at<$2 AND co.deleted_at IS NULL`,
		petID, before.UTC())
	return err
}
func (r *Repo) TodayRowsForPet(ctx context.Context, q db.Q, petID string, dueDate time.Time) ([]TodayRow, error) {
	return r.todayRows(ctx, q, `co.pet_id=$1 AND co.due_date=$2 AND ci.status='active' AND ci.deleted_at IS NULL AND p.status='active' AND co.deleted_at IS NULL`, petID, dueDate)
}
func (r *Repo) TodayRowsForPetInWindow(ctx context.Context, q db.Q, petID string, start, end time.Time) ([]TodayRow, error) {
	return r.todayRows(ctx, q, `co.pet_id=$1 AND co.due_at>=$2 AND co.due_at<$3 AND ci.status='active' AND ci.deleted_at IS NULL AND p.status='active' AND co.deleted_at IS NULL`, petID, start.UTC(), end.UTC())
}

func (r *Repo) TodayRowsForFamilyPetInWindow(ctx context.Context, q db.Q, familyID, petID string, start, end time.Time) ([]TodayRow, error) {
	return r.todayRows(ctx, q, `ci.family_id=$1 AND EXISTS(SELECT 1 FROM family_pet_links fp WHERE fp.family_id=$1 AND fp.pet_id=co.pet_id AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL) AND co.pet_id=$2 AND co.due_at>=$3 AND co.due_at<$4 AND ci.status='active' AND ci.deleted_at IS NULL AND p.status='active' AND co.deleted_at IS NULL`, familyID, petID, start.UTC(), end.UTC())
}

func (r *Repo) MarkMissedBeforeFamilyPetAt(ctx context.Context, q db.Q, familyID, petID string, before time.Time) error {
	_, err := q.Exec(ctx, `UPDATE care_occurrences co SET status='missed' FROM pets p, care_plans cp
		WHERE p.id = co.pet_id AND p.status='active' AND p.deleted_at IS NULL
		  AND cp.family_id=$1 AND cp.status='active' AND cp.deleted_at IS NULL
		  AND co.pet_id=$2 AND co.status='pending' AND co.due_at<$3 AND co.deleted_at IS NULL
		  AND EXISTS(SELECT 1 FROM family_pet_links fp WHERE fp.family_id=$1 AND fp.pet_id=co.pet_id AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL)`,
		familyID, petID, before.UTC())
	return err
}

type TodayRow struct {
	Task
	PetName        string
	AssignedToName *string
	DoneByName     *string
	Log            *TaskLog
	CareRequest    *CareRequestSummary
}

type CareRequestSummary struct {
	ID                 string    `json:"id"`
	State              string    `json:"state"`
	FromUserID         string    `json:"from_user_id"`
	FromUserName       string    `json:"from_user_name"`
	TargetUserID       string    `json:"target_user_id"`
	TargetUserName     string    `json:"target_user_name"`
	NextTargetUserID   string    `json:"next_target_user_id,omitempty"`
	NextTargetUserName string    `json:"next_target_user_name,omitempty"`
	UpdatedAt          time.Time `json:"updated_at"`
}

func valueOrEmpty(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}
func scanTodayRows(rows pgx.Rows) ([]TodayRow, error) {
	defer rows.Close()
	var out []TodayRow
	for rows.Next() {
		var v TodayRow
		var requestID, requestState, requestFromID, requestFromName, requestTargetID, requestTargetName, requestNextTargetID, requestNextTargetName *string
		var requestUpdatedAt *time.Time
		var id, tid, status, done, note, name *string
		var date, at *time.Time
		if err := rows.Scan(&v.ID, &v.PetID, &v.FamilyID, &v.CarePlanID, &v.CareRuleID, &v.MedicationID, &v.Type, &v.Title, &v.Description, &v.Schedule, &v.TimeOfDay, &v.Timezone, &v.CreatedByUserID, &v.ArchivedAt, &v.CreatedAt, &v.DueAt, &v.DueDate, &v.Status, &v.AssignedTo, &v.CompletedBy, &v.CompletedAt, &requestID, &requestState, &requestFromID, &requestFromName, &requestTargetID, &requestTargetName, &requestUpdatedAt, &requestNextTargetID, &requestNextTargetName, &v.PetName, &v.AssignedToName, &id, &tid, &date, &status, &done, &at, &note, &name); err != nil {
			return nil, err
		}
		if requestID != nil && requestState != nil && requestFromID != nil && requestFromName != nil && requestTargetID != nil && requestTargetName != nil && requestUpdatedAt != nil {
			v.CareRequest = &CareRequestSummary{ID: *requestID, State: *requestState, FromUserID: *requestFromID, FromUserName: *requestFromName, TargetUserID: *requestTargetID, TargetUserName: *requestTargetName, NextTargetUserID: valueOrEmpty(requestNextTargetID), NextTargetUserName: valueOrEmpty(requestNextTargetName), UpdatedAt: *requestUpdatedAt}
		}
		if id != nil && date != nil && at != nil {
			v.Log = &TaskLog{ID: *id, TaskID: *tid, LogDate: *date, Status: *status, DoneBy: valueOrEmpty(done), DoneAt: *at, Note: valueOrEmpty(note)}
		}
		v.DoneByName = name
		out = append(out, v)
	}
	return out, rows.Err()
}
func (r *Repo) Get(ctx context.Context, q db.Q, id string) (Task, error) {
	return scanTask(q.QueryRow(ctx, `SELECT `+occurrenceCols+` FROM care_occurrences co JOIN care_plans ci ON ci.id=co.care_plan_id JOIN care_rules cr ON cr.id=co.care_rule_id JOIN pets p ON p.id=co.pet_id WHERE co.id=$1 AND co.deleted_at IS NULL`, id))
}
func (r *Repo) GetForUpdate(ctx context.Context, q db.Q, id string) (Task, error) {
	return scanTask(q.QueryRow(ctx, `SELECT `+occurrenceCols+` FROM care_occurrences co JOIN care_plans ci ON ci.id=co.care_plan_id JOIN care_rules cr ON cr.id=co.care_rule_id JOIN pets p ON p.id=co.pet_id WHERE co.id=$1 AND co.deleted_at IS NULL FOR UPDATE`, id))
}
func (r *Repo) GetTaskLog(ctx context.Context, q db.Q, id string) (TaskLog, error) {
	var v TaskLog
	err := q.QueryRow(ctx, `SELECT id,id,due_date,status,COALESCE(completed_by_user_id::text,''),completed_at,note FROM care_occurrences WHERE id=$1 AND status IN('completed','skipped') AND deleted_at IS NULL`, id).Scan(&v.ID, &v.TaskID, &v.LogDate, &v.Status, &v.DoneBy, &v.DoneAt, &v.Note)
	return v, err
}
func (r *Repo) GetTaskLogForUpdate(ctx context.Context, q db.Q, id string) (TaskLog, error) {
	var v TaskLog
	err := q.QueryRow(ctx, `SELECT id,id,due_date,status,COALESCE(completed_by_user_id::text,''),completed_at,note FROM care_occurrences WHERE id=$1 AND status IN('completed','skipped') AND deleted_at IS NULL FOR UPDATE`, id).Scan(&v.ID, &v.TaskID, &v.LogDate, &v.Status, &v.DoneBy, &v.DoneAt, &v.Note)
	return v, err
}
func (r *Repo) InsertLog(ctx context.Context, q db.Q, id, status, doneBy, note string) (TaskLog, error) {
	var v TaskLog
	err := q.QueryRow(ctx, `UPDATE care_occurrences SET status=$2,completed_by_user_id=$3,completed_at=now(),note=$4 WHERE id=$1 AND status IN('pending','missed') AND deleted_at IS NULL RETURNING id,id,due_date,status,COALESCE(completed_by_user_id::text,''),completed_at,note`, id, status, doneBy, note).Scan(&v.ID, &v.TaskID, &v.LogDate, &v.Status, &v.DoneBy, &v.DoneAt, &v.Note)
	return v, err
}
func (r *Repo) LogForTaskDateWithName(ctx context.Context, q db.Q, id string) (TaskLogWithName, error) {
	var v TaskLogWithName
	err := q.QueryRow(ctx, `SELECT co.id,co.id,co.due_date,co.status,COALESCE(co.completed_by_user_id::text,''),co.completed_at,co.note,u.display_name FROM care_occurrences co LEFT JOIN users u ON u.id=co.completed_by_user_id WHERE co.id=$1 AND co.status IN('completed','skipped') AND co.deleted_at IS NULL`, id).Scan(&v.ID, &v.TaskID, &v.LogDate, &v.Status, &v.DoneBy, &v.DoneAt, &v.Note, &v.DoneByName)
	return v, err
}

type TaskLogWithName struct {
	TaskLog
	DoneByName *string `json:"done_by_name,omitempty"`
}

type CareCompletionRecipient struct {
	UserID    string
	PetName   string
	Title     string
	ActorName string
}

func (r *Repo) CareCompletionRecipients(ctx context.Context, q db.Q, occurrenceID, actorID string) ([]CareCompletionRecipient, error) {
	rows, err := q.Query(ctx, `
		SELECT DISTINCT recipient.id::text, p.name,
		       COALESCE(NULLIF(co.title_snapshot,''), cp.title),
		       COALESCE(actor.display_name, actor.email)
		FROM care_requests crq
		JOIN care_occurrences co ON co.id=crq.occurrence_id AND co.id=$1
		JOIN care_plans cp ON cp.id=co.care_plan_id
		JOIN pets p ON p.id=co.pet_id
		JOIN users actor ON actor.id=$2
		JOIN users recipient ON recipient.id IN (crq.from_user_id, crq.target_user_id) AND recipient.id<>$2
		WHERE crq.deleted_at IS NULL
		ORDER BY recipient.id::text`, occurrenceID, actorID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []CareCompletionRecipient{}
	for rows.Next() {
		var recipient CareCompletionRecipient
		if err := rows.Scan(&recipient.UserID, &recipient.PetName, &recipient.Title, &recipient.ActorName); err != nil {
			return nil, err
		}
		out = append(out, recipient)
	}
	return out, rows.Err()
}

func (r *Repo) DeleteLog(ctx context.Context, q db.Q, id string) error {
	// 撤销一律恢复 pending（对齐 MarkMissed 的"次日才算 missed"宽限）：
	// 当天过点未做的任务保持 pending 才能继续出现在提醒候选里；若确属
	// 往日，下一次 Today 扫描会按日界把它翻成 missed。
	tag, err := q.Exec(ctx, `UPDATE care_occurrences SET status='pending',completed_by_user_id=NULL,completed_at=NULL,note='' WHERE id=$1 AND status IN('completed','skipped') AND deleted_at IS NULL`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}
func (r *Repo) UpdateLegacy(ctx context.Context, q db.Q, itemID, title string, frequency []byte, timeOfDay *time.Time, timeOfDaySet bool, archived *bool) (Task, error) {
	item, err := r.GetItem(ctx, q, itemID)
	if err != nil {
		return Task{}, err
	}
	rule, err := r.GetRuleByItem(ctx, q, itemID)
	if err != nil {
		return Task{}, err
	}
	status := ""
	if archived != nil {
		if *archived {
			status = "archived"
		} else {
			status = "active"
		}
	}
	if _, err = r.UpdateItem(ctx, q, itemID, "", title, "", false, status); err != nil {
		return Task{}, err
	}
	if _, err = r.UpdateRule(ctx, q, rule.ID, frequency, timeOfDay, timeOfDaySet, time.Time{}, rule.EndDate); err != nil {
		return Task{}, err
	}
	return r.compatibilityItemTask(ctx, q, item, rule)
}
func (r *Repo) compatibilityItemTask(ctx context.Context, q db.Q, item CarePlan, rule CareRule) (Task, error) {
	return scanTask(q.QueryRow(ctx, `SELECT ci.id,ci.pet_id,COALESCE(ci.family_id::text,''),ci.id,cr.id,COALESCE(ci.medication_id::text,''),ci.type,ci.title,ci.description,cr.schedule,cr.local_time,cr.timezone,COALESCE(ci.created_by_user_id::text,''),CASE WHEN ci.status='archived' THEN ci.updated_at ELSE NULL END,ci.created_at,NULL::timestamptz,NULL::date,ci.status,NULL::uuid,NULL::uuid,NULL::timestamptz FROM care_plans ci JOIN care_rules cr ON cr.id=$2 WHERE ci.id=$1`, item.ID, rule.ID))
}

// CareStatsDay 是单个宠物单日的照护执行汇总(服务端事实,missed 含分母)。
type CareStatsDay struct {
	PetID     string
	Date      string
	Total     int
	Completed int
	Skipped   int
	Missed    int
}

// ListCareStats 聚合区间内 occurrences 的执行状态;cancelled 不计入。
func (r *Repo) ListCareStats(ctx context.Context, q db.Q, petIDs []string, from, to time.Time) ([]CareStatsDay, error) {
	rows, err := q.Query(ctx, `
		SELECT co.pet_id::text, to_char(co.due_date,'YYYY-MM-DD'),
		       count(*),
		       count(*) FILTER (WHERE co.status='completed'),
		       count(*) FILTER (WHERE co.status='skipped'),
		       count(*) FILTER (WHERE co.status='missed')
		FROM care_occurrences co
		WHERE co.deleted_at IS NULL AND co.status <> 'cancelled'
		  AND co.pet_id = ANY($1::uuid[])
		  AND co.due_date >= $2::date AND co.due_date <= $3::date
		  AND co.due_at <= now() -- 未到点的不进分母
		GROUP BY 1,2 ORDER BY 2`, petIDs, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []CareStatsDay
	for rows.Next() {
		var d CareStatsDay
		if err := rows.Scan(&d.PetID, &d.Date, &d.Total, &d.Completed, &d.Skipped, &d.Missed); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// ListFamilyPetsForUser 返回家庭可见的活跃宠物(id+名字),仅用于统计命名。
// 只含 status='active'：归档宠只读，不应进入完成率分母。
func (r *Repo) ListFamilyPetsForUser(ctx context.Context, q db.Q, familyID string) ([]contracts.Pet, error) {
	rows, err := q.Query(ctx, `
		SELECT p.id::text, p.name FROM pets p
		JOIN family_pet_links fp ON fp.pet_id=p.id AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL
		WHERE fp.family_id=$1 AND p.deleted_at IS NULL AND p.status='active' ORDER BY p.name`, familyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []contracts.Pet
	for rows.Next() {
		var id, name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, err
		}
		out = append(out, contracts.Pet{ID: id, Name: name})
	}
	return out, rows.Err()
}
