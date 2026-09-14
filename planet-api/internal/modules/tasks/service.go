package tasks

import (
	"context"
	"encoding/json"
	"errors"
	"math"
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

const backfillDays = 7

// viewBackfillDays：Today/TodayForPet 的只读回看窗口。前端日期选择器允许
// 回看 30 天（"更早"）；完成/撤销仍是 7 天补录窗——查看更宽、写入更严，
// 两个窗口有意不同。
const viewBackfillDays = 30
const defaultCareTimezone = "Asia/Shanghai"

// A plan list is also a planning surface. Keep enough projected occurrences
// available for it to answer "when is the next one?" without making Today the
// only place where a recurring plan becomes concrete.
const carePlanPreviewDays = 30

// careTimezoneForPet resolves civil dates only after the caller has identified
// which Family edge owns this write. A multi-family Pet without an explicit
// edge is ambiguous; silently choosing the first link can move a task across
// the intended calendar day.
func careTimezoneForPet(ctx context.Context, pet contracts.Pet, familyID, userID string, members contracts.MembershipService) (string, error) {
	if familyID == "" && len(pet.FamilyIDs) == 1 {
		familyID = pet.FamilyIDs[0]
	}
	if len(pet.FamilyIDs) > 1 && familyID == "" {
		return "", httpx.ErrValidation("family_id is required when a pet belongs to multiple families")
	}
	if familyID == "" {
		return defaultCareTimezone, nil
	}
	belongsToPet := false
	for _, candidate := range pet.FamilyIDs {
		if candidate == familyID {
			belongsToPet = true
			break
		}
	}
	if !belongsToPet {
		return "", httpx.ErrValidation("family_id does not belong to the pet")
	}
	if members == nil {
		return defaultCareTimezone, nil
	}
	if _, active, err := members.ActiveMember(ctx, familyID, userID); err != nil {
		return "", err
	} else if !active {
		return "", httpx.ErrNotFound("")
	}
	timezone, err := members.FamilyTimezone(ctx, familyID)
	if err != nil {
		return "", err
	}
	if timezone == "" {
		return defaultCareTimezone, nil
	}
	return timezone, nil
}

var validCarePlanTypes = map[string]bool{
	"medication": true, "feeding": true, "health": true,
	"grooming": true, "exercise": true, "custom": true,
}

type Service struct {
	Repo         *Repo
	Pool         *pgxpool.Pool
	Guard        contracts.PetsGuard
	Members      contracts.MembershipService
	Events       contracts.TimelineRecorder
	Notifier     contracts.UserNotifier
	CareRequests contracts.CareRequestCloser
	// AccessiblePets is injected by app composition for the aggregate Today
	// query. Keeping discovery in the pets module preserves the ACL single
	// point instead of making Today infer visibility from Family names.
	AccessiblePets func(context.Context, string) ([]contracts.Pet, error)
	// AccessibleFamilies is the other half of the aggregate Today boundary.
	// All-scope care must be assembled per visible Family edge so a shared Pet
	// does not merge plans (or civil-day boundaries) from unrelated Families.
	AccessibleFamilies func(context.Context, string) ([]contracts.Family, error)
}

func validateTitle(title string) error {
	title = strings.TrimSpace(title)
	if title == "" || len([]rune(title)) > 120 {
		return httpx.ErrValidation("title must be 1-120 chars")
	}
	return nil
}

func validateCareType(itemType string) error {
	if !validCarePlanTypes[itemType] {
		return httpx.ErrValidation("type must be medication|feeding|health|grooming|exercise|custom")
	}
	return nil
}

func carePlanAuditMetadata(item CarePlan) map[string]any {
	metadata := map[string]any{
		"pet_id": item.PetID,
		"title":  item.Title,
		"type":   item.Type,
	}
	if item.FamilyID != "" {
		metadata["family_id"] = item.FamilyID
	}
	return metadata
}

// Create is the compatibility entry for POST /pets/{id}/tasks. It creates a
// CarePlan and CareRule, then materializes today's occurrence when scheduled.
func (s *Service) Create(ctx context.Context, petID, userID, title string, schedule []byte, timeOfDay *time.Time) (Task, error) {
	return s.CreateAt(ctx, petID, userID, "custom", title, "", schedule, time.Now(), nil, timeOfDay)
}

func (s *Service) CreateAt(ctx context.Context, petID, userID, itemType, title, description string, frequency []byte, now time.Time, endDate *time.Time, timeOfDay *time.Time) (Task, error) {
	result, err := s.CreateCarePlanAt(ctx, petID, userID, itemType, title, description, frequency, now, endDate, timeOfDay)
	return compatibilityTaskResult(result, err)
}

func (s *Service) CreateAtWithIdempotency(ctx context.Context, petID, userID, itemType, title, description string, frequency []byte, now time.Time, endDate *time.Time, timeOfDay *time.Time, idempotencyKey string) (Task, error) {
	result, err := s.CreateAtForMedicationWithIdempotency(ctx, petID, userID, itemType, title, description, "", frequency, now, endDate, timeOfDay, idempotencyKey)
	return compatibilityTaskResult(result, err)
}

// CreateAtForMedicationWithIdempotency 创建可关联用药档案的照护计划：
// medication_id 非空时计划 type 必须是 medication，且用药属于同一宠物。
// 停药/删药将联动归档该计划（meds.Service）。
func (s *Service) CreateAtForMedicationWithIdempotency(ctx context.Context, petID, userID, itemType, title, description, medicationID string, frequency []byte, now time.Time, endDate *time.Time, timeOfDay *time.Time, idempotencyKey string) (CarePlanResult, error) {
	return s.CreateAtForMedicationWithFamily(ctx, petID, userID, itemType, title, description, medicationID, frequency, now, endDate, timeOfDay, "", idempotencyKey)
}

func (s *Service) CreateAtForMedicationWithFamily(ctx context.Context, petID, userID, itemType, title, description, medicationID string, frequency []byte, now time.Time, endDate *time.Time, timeOfDay *time.Time, familyID, idempotencyKey string) (CarePlanResult, error) {
	return s.createCarePlanAt(ctx, petID, userID, itemType, title, description, frequency, now, endDate, timeOfDay, nil, idempotencyKey, medicationID, familyID)
}

func compatibilityTaskResult(result CarePlanResult, err error) (Task, error) {
	if err != nil {
		return Task{}, err
	}
	if result.FirstTask != nil {
		return *result.FirstTask, nil
	}
	return Task{ID: result.Item.ID, PetID: result.Item.PetID, FamilyID: result.Item.FamilyID, MedicationID: result.Item.MedicationID, CarePlanID: result.Item.ID, CareRuleID: result.Rule.ID,
		Type: result.Item.Type, Title: result.Item.Title, Description: result.Item.Description, Schedule: result.Rule.Frequency,
		TimeOfDay: result.Rule.TimeOfDay, Timezone: result.Rule.Timezone, CreatedByUserID: result.Item.CreatedByUserID, CreatedAt: result.Item.CreatedAt,
		Status: result.Item.Status}, nil
}

type CarePlanResult struct {
	Item      CarePlan
	Rule      CareRule
	FirstTask *Task
}

func (s *Service) CreateCarePlanAt(ctx context.Context, petID, userID, itemType, title, description string, frequency []byte, now time.Time, endDate *time.Time, timeOfDay *time.Time) (CarePlanResult, error) {
	return s.createCarePlanAt(ctx, petID, userID, itemType, title, description, frequency, now, endDate, timeOfDay, nil, "", "", "")
}

func (s *Service) CreateCarePlanAtWithIdempotency(ctx context.Context, petID, userID, itemType, title, description string, frequency []byte, now time.Time, endDate *time.Time, timeOfDay *time.Time, idempotencyKey string) (CarePlanResult, error) {
	return s.createCarePlanAt(ctx, petID, userID, itemType, title, description, frequency, now, endDate, timeOfDay, nil, idempotencyKey, "", "")
}

func (s *Service) CreateCarePlanAtWithOptions(ctx context.Context, petID, userID, itemType, title, description string, frequency []byte, now time.Time, startDate, endDate *time.Time, timeOfDay *time.Time, idempotencyKey string) (CarePlanResult, error) {
	return s.CreateCarePlanAtWithOptionsForFamily(ctx, petID, userID, itemType, title, description, frequency, now, startDate, endDate, timeOfDay, "", idempotencyKey)
}

func (s *Service) CreateCarePlanAtWithOptionsForFamily(ctx context.Context, petID, userID, itemType, title, description string, frequency []byte, now time.Time, startDate, endDate *time.Time, timeOfDay *time.Time, familyID, idempotencyKey string) (CarePlanResult, error) {
	return s.createCarePlanAt(ctx, petID, userID, itemType, title, description, frequency, now, endDate, timeOfDay, startDate, idempotencyKey, "", familyID)
}

// CreateCarePlanAtWithOptionsForFamilyAndMedication creates a recurring plan
// while preserving the medication link used by medication alerts and the
// stop/delete cascade.
func (s *Service) CreateCarePlanAtWithOptionsForFamilyAndMedication(ctx context.Context, petID, userID, itemType, title, description string, medicationID string, frequency []byte, now time.Time, startDate, endDate *time.Time, timeOfDay *time.Time, familyID, idempotencyKey string) (CarePlanResult, error) {
	return s.createCarePlanAt(ctx, petID, userID, itemType, title, description, frequency, now, endDate, timeOfDay, startDate, idempotencyKey, medicationID, familyID)
}

func (s *Service) createCarePlanAt(ctx context.Context, petID, userID, itemType, title, description string, frequency []byte, now time.Time, endDate *time.Time, timeOfDay, requestedStartDate *time.Time, idempotencyKey, medicationID, familyID string) (CarePlanResult, error) {
	if err := validateTitle(title); err != nil {
		return CarePlanResult{}, err
	}
	if err := validateCareType(itemType); err != nil {
		return CarePlanResult{}, err
	}
	schedule, err := ParseSchedule(frequency)
	if err != nil {
		return CarePlanResult{}, err
	}
	if timeOfDay != nil && (timeOfDay.Hour() > 23 || timeOfDay.Minute() > 59) {
		return CarePlanResult{}, httpx.ErrValidation("invalid time_of_day")
	}
	if endDate != nil && requestedStartDate != nil && endDate.Before(*requestedStartDate) {
		return CarePlanResult{}, httpx.ErrValidation("rule.end_date cannot be before rule.start_date")
	}
	var result CarePlanResult
	err = db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		// Family ownership governs a family-scoped care system. The Pet owner
		// remains a valid manager, but must not be the only manager.
		pet, _, err := s.Guard.RequirePetInTx(ctx, tx, petID, userID, false, true)
		if err != nil {
			return err
		}
		if medicationID != "" {
			if itemType != "medication" {
				return httpx.ErrValidation("medication_id requires type=medication")
			}
			var medPetID string
			if err := tx.QueryRow(ctx, `SELECT pet_id::text FROM medications WHERE id=$1 AND deleted_at IS NULL`, medicationID).Scan(&medPetID); err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					return httpx.ErrNotFound("medication not found")
				}
				return err
			}
			if medPetID != petID {
				return httpx.ErrValidation("medication belongs to a different pet")
			}
		}
		timezone, err := careTimezoneForPet(ctx, pet, familyID, userID, s.Members)
		if err != nil {
			return err
		}
		planFamilyID := familyID
		if planFamilyID == "" && len(pet.FamilyIDs) == 1 {
			planFamilyID = pet.FamilyIDs[0]
		}
		if planFamilyID != "" {
			if s.Members == nil {
				return httpx.ErrNotFound("")
			}
			member, active, err := s.Members.ActiveMember(ctx, planFamilyID, userID)
			if err != nil {
				return err
			}
			if !active {
				return httpx.ErrNotFound("")
			}
			if pet.CurrentOwnerUserID != userID && member.Role != contracts.RoleOwner {
				return httpx.ErrRoleForbidden()
			}
		} else if pet.CurrentOwnerUserID != userID {
			return httpx.ErrRoleForbidden()
		}
		tz, err := time.LoadLocation(timezone)
		if err != nil {
			return httpx.ErrValidation("care rule timezone invalid")
		}
		start := now.In(tz)
		startDate := dateAt(start, tz)
		if requestedStartDate != nil {
			startDate = civilDateAt(*requestedStartDate, tz)
		}
		var ruleEndDate *time.Time
		if endDate != nil {
			d := civilDateAt(*endDate, tz)
			ruleEndDate = &d
		}
		scope := "care-plan:" + petID
		claim, err := db.ClaimIdempotency(ctx, tx, userID, scope, idempotencyKey,
			// familyID is part of the command identity. The same pet can have
			// independent care systems in several Families; a retry must never
			// replay a plan into the wrong Family edge.
			db.RequestHash(petID, familyID, itemType, strings.TrimSpace(title), strings.TrimSpace(description), medicationID, string(frequency), formatOptionalDate(requestedStartDate), formatOptionalDate(endDate), formatOptionalTime(timeOfDay)))
		if err != nil {
			if errors.Is(err, db.ErrIdempotencyKeyReused) {
				return httpx.NewAppError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different request")
			}
			return err
		}
		if claim.Replay {
			item, err := s.Repo.GetItem(ctx, tx, claim.ResourceID)
			if err != nil {
				return err
			}
			rule, err := s.Repo.GetRuleByItem(ctx, tx, item.ID)
			if err != nil {
				return err
			}
			result.Item, result.Rule = item, rule
			if task, taskErr := s.Repo.GetFirstTaskForRule(ctx, tx, rule.ID); taskErr == nil {
				result.FirstTask = &task
			} else if !errors.Is(taskErr, pgx.ErrNoRows) {
				return taskErr
			}
			return nil
		}
		item, err := s.Repo.CreateItem(ctx, tx, petID, planFamilyID, itemType, strings.TrimSpace(title), strings.TrimSpace(description), medicationID, userID)
		if err != nil {
			return err
		}
		result.Item = item
		if err := db.BindIdempotency(ctx, tx, userID, scope, idempotencyKey, "care_plan", item.ID); err != nil {
			return err
		}
		rule, err := s.Repo.CreateRule(ctx, tx, item.ID, frequency, startDate, ruleEndDate, timeOfDay, timezone, userID)
		if err != nil {
			return err
		}
		// CreateItem returns the plan before its schedule is attached. Reload the
		// canonical subject so the response and any downstream materialization
		// see one coherent CarePlan, not a half-created projection with `{}`.
		item, err = s.Repo.GetItem(ctx, tx, item.ID)
		if err != nil {
			return err
		}
		result.Item = item
		result.Rule = rule
		if err := s.Repo.Assign(ctx, tx, item.ID, userID, "owner", userID); err != nil {
			return err
		}
		if err := platformaudit.Record(ctx, tx, userID, "care_plan_created", "care_plan", item.ID, carePlanAuditMetadata(item)); err != nil {
			return err
		}
		if !startDate.After(dateAt(start, tz)) && schedule.ScheduledOn(startDate, startDate, tz) {
			candidate := ruleCandidateFrom(item, rule, userID)
			candidate.AssignedTo, err = s.defaultOccurrenceAssignee(ctx, tx, candidate)
			if err != nil {
				return err
			}
			created, err := s.materializeCandidate(ctx, tx, candidate, startDate, tz)
			if err == nil {
				result.FirstTask = &created
			}
			if errors.Is(err, pgx.ErrNoRows) {
				return nil
			}
			return err
		}
		return nil
	})
	return result, httpx.MapDBErr(err)
}

func formatOptionalDate(v *time.Time) string {
	if v == nil {
		return ""
	}
	return v.Format("2006-01-02")
}

func formatOptionalTime(v *time.Time) string {
	if v == nil {
		return ""
	}
	return v.Format("15:04")
}

func ruleCandidateFrom(item CarePlan, rule CareRule, assigned string) ruleCandidate {
	return ruleCandidate{ItemID: item.ID, RuleID: rule.ID, PetID: item.PetID, FamilyID: item.FamilyID, Title: item.Title,
		Description: item.Description, Type: item.Type, ItemStatus: item.Status, ItemCreated: item.CreatedAt,
		Frequency: rule.Frequency, StartDate: rule.StartDate, EndDate: rule.EndDate, TimeOfDay: rule.TimeOfDay,
		Timezone: rule.Timezone, AssignedTo: &assigned}
}

func dateAt(t time.Time, tz *time.Location) time.Time {
	d := t.In(tz)
	return time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, tz)
}

// civilDateAt preserves the year/month/day supplied by an API date field.
// A YYYY-MM-DD value is not an instant and must not roll into another day
// merely because the Family timezone is ahead of or behind UTC.
func civilDateAt(t time.Time, tz *time.Location) time.Time {
	year, month, day := t.Date()
	return time.Date(year, month, day, 0, 0, 0, 0, tz)
}

// dueAt computes the occurrence instant from a civil date + local time.
//
// DST 行为（权威实现，migrations 里 care_rules.dst_policy 列当前不被读取，
// 其 CHECK 枚举中的 reject/second/shift_backward 是未实现的保留值）：
//   - 春令时缺口（如 02:30 不存在）：向后平移到过渡后的第一个有效时刻（03:30）；
//   - 秋令时歧义（同一墙钟出现两次）：取较早的一次。
func dueAt(date time.Time, tod *time.Time, tz *time.Location) time.Time {
	hour, minute := 0, 0
	if tod != nil {
		hour, minute = tod.Hour(), tod.Minute()
	}
	requested := time.Date(date.Year(), date.Month(), date.Day(), hour, minute, 0, 0, tz)
	// DST policy is explicit: an ambiguous wall-clock time uses Go's earlier
	// occurrence; a nonexistent time shifts forward through the transition
	// (for example 02:30 -> 03:30 on spring-forward).
	local := requested.In(tz)
	if local.Hour() == hour && local.Minute() == minute {
		return requested
	}
	for candidate := requested; candidate.Sub(requested) < 2*time.Hour; candidate = candidate.Add(time.Minute) {
		local = candidate.In(tz)
		if local.Hour() == hour+1 && local.Minute() == minute {
			return candidate
		}
	}
	return requested
}

func (s *Service) materializeCandidate(ctx context.Context, q db.Q, candidate ruleCandidate, date time.Time, _ *time.Location) (Task, error) {
	rule, err := ParseSchedule(candidate.Frequency)
	if err != nil {
		return Task{}, err
	}
	tz, err := time.LoadLocation(candidate.Timezone)
	if err != nil {
		return Task{}, httpx.ErrValidation("care rule timezone invalid")
	}
	ov, ovErr := s.Repo.GetOverride(ctx, q, candidate.RuleID, dateAt(date, tz))
	var ovPtr *ScheduleOverride
	if ovErr == nil {
		ovPtr = &ov
	} else if !errors.Is(ovErr, pgx.ErrNoRows) {
		return Task{}, ovErr
	}
	return s.materializePrepared(ctx, q, candidate, rule, tz, date, ovPtr)
}

// materializePrepared 是物化的核心：排程已解析、时区已加载、override 已取回，
// 逐日循环只做判定与 upsert。
func (s *Service) materializePrepared(ctx context.Context, q db.Q, candidate ruleCandidate, rule Schedule, tz *time.Location, date time.Time, ov *ScheduleOverride) (Task, error) {
	// PostgreSQL DATE values are decoded by pgx as midnight UTC, while date is
	// a calendar date in the Rule timezone. Compare calendar keys rather
	// than instants; otherwise Asia/Shanghai turns the same DATE into the prior
	// UTC day and newly-created daily rules never materialize.
	dateKey := calendarKey(date, tz)
	startKey := calendarKey(candidate.StartDate, tz)
	endBefore := candidate.EndDate != nil && dateKey > calendarKey(*candidate.EndDate, tz)
	if dateKey < startKey || endBefore || !rule.ScheduledOn(date, candidate.StartDate, tz) {
		return Task{}, pgx.ErrNoRows
	}
	// replace 与 skip 同样抑制原槽位：substitute 的语义是"原槽换新任务"。
	// 曾经只识别 skip，未来未物化的槽位在 substitute 后照样物化出原任务，
	// 与替任务并存。
	if ov != nil && (ov.Kind == "skip" || ov.Kind == "replace") {
		return Task{}, pgx.ErrNoRows
	}
	date = dateAt(date, tz)
	at := dueAt(date, candidate.TimeOfDay, tz)
	if ov != nil && ov.Kind == "move" && ov.DueAt != nil {
		at = *ov.DueAt
	}
	assignedTo, err := s.defaultOccurrenceAssignee(ctx, q, candidate)
	if err != nil {
		return Task{}, err
	}
	candidate.AssignedTo = assignedTo
	return s.Repo.MaterializeTask(ctx, q, candidate, at, date)
}

// A Family with more than one member who can participate in care must start
// each new occurrence unassigned. That makes the daily collaboration strip
// real: a member claims this occurrence or hands it to someone else. A
// single-person Family keeps the convenient default assignment to its owner.
// Existing assignments are preserved by MaterializeTask's conflict update.
func (s *Service) defaultOccurrenceAssignee(ctx context.Context, q db.Q, candidate ruleCandidate) (*string, error) {
	if candidate.FamilyID == "" || candidate.AssignedTo == nil || *candidate.AssignedTo == "" {
		return candidate.AssignedTo, nil
	}
	var participants int
	if err := q.QueryRow(ctx, `SELECT count(*) FROM family_memberships WHERE family_id=$1 AND role IN ('owner','caregiver') AND status='active' AND ended_at IS NULL AND deleted_at IS NULL`, candidate.FamilyID).Scan(&participants); err != nil {
		return nil, err
	}
	if participants > 1 {
		return nil, nil
	}
	return candidate.AssignedTo, nil
}

func calendarKey(t time.Time, tz *time.Location) string {
	// DATE values read from PostgreSQL are represented as midnight UTC by
	// pgx. They still carry the requested civil date, so converting them to a
	// timezone would be incorrect around UTC+/- boundaries.
	year, month, day := t.Date()
	return time.Date(year, month, day, 0, 0, 0, 0, tz).Format("2006-01-02")
}

func (s *Service) materializeFamily(ctx context.Context, q db.Q, familyID string, date time.Time) error {
	tzName, err := s.Members.FamilyTimezone(ctx, familyID)
	if err != nil {
		return err
	}
	tz, err := time.LoadLocation(tzName)
	if err != nil {
		return httpx.ErrValidation("family timezone invalid")
	}
	candidates, err := s.Repo.ListRulesForFamily(ctx, q, familyID)
	if err != nil {
		return err
	}
	return s.materializeFamilyWindow(ctx, q, candidates, dateAt(date, tz), dateAt(date, tz).AddDate(0, 0, 1))
}

func (s *Service) materializeFamilyWindow(ctx context.Context, q db.Q, candidates []ruleCandidate, start, end time.Time) error {
	// 预取整个窗口的 overrides + 预解析每个规则的排程/时区：
	// 把"规则×天数"的逐日 GetOverride+ParseSchedule 压成 1 次批量查询。
	if len(candidates) == 0 {
		return nil
	}
	ruleIDs := make([]string, 0, len(candidates))
	for _, c := range candidates {
		ruleIDs = append(ruleIDs, c.RuleID)
	}
	overrides, err := s.Repo.OverridesForWindow(ctx, q, ruleIDs, start.AddDate(0, 0, -2), end.AddDate(0, 0, 2))
	if err != nil {
		return err
	}
	type preparedRule struct {
		candidate ruleCandidate
		schedule  Schedule
		tz        *time.Location
	}
	prepared := make([]preparedRule, 0, len(candidates))
	for _, candidate := range candidates {
		schedule, perr := ParseSchedule(candidate.Frequency)
		if perr != nil {
			return perr
		}
		tz, terr := time.LoadLocation(candidate.Timezone)
		if terr != nil {
			return httpx.ErrValidation("care rule timezone invalid")
		}
		prepared = append(prepared, preparedRule{candidate, schedule, tz})
	}
	for _, pc := range prepared {
		first := dateAt(start.In(pc.tz), pc.tz).AddDate(0, 0, -1)
		last := dateAt(end.In(pc.tz), pc.tz).AddDate(0, 0, 1)
		for date := first; !date.After(last); date = date.AddDate(0, 0, 1) {
			var ovPtr *ScheduleOverride
			if v, exists := overrides[pc.candidate.RuleID+"|"+calendarKey(date, pc.tz)]; exists {
				ovPtr = &v
			}
			if _, err := s.materializePrepared(ctx, q, pc.candidate, pc.schedule, pc.tz, date, ovPtr); errors.Is(err, pgx.ErrNoRows) {
				continue
			} else if err != nil {
				return err
			}
		}
	}
	return nil
}

func (s *Service) materializePet(ctx context.Context, q db.Q, petID string, date time.Time, tz *time.Location) error {
	candidates, err := s.Repo.ListRulesForPet(ctx, q, petID)
	if err != nil {
		return err
	}
	return s.materializePetWindow(ctx, q, candidates, dateAt(date, tz), dateAt(date, tz).AddDate(0, 0, 1))
}

func (s *Service) materializePetWindow(ctx context.Context, q db.Q, candidates []ruleCandidate, start, end time.Time) error {
	return s.materializeFamilyWindow(ctx, q, candidates, start, end)
}

func (s *Service) ListByPet(ctx context.Context, petID, userID string, includeArchived bool, familyID string) ([]Task, error) {
	var out []Task
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		pet, _, err := s.Guard.RequirePetInTx(ctx, tx, petID, userID, false, false)
		if err != nil {
			return err
		}
		if familyID != "" {
			belongs := false
			for _, linkedFamilyID := range pet.FamilyIDs {
				if linkedFamilyID == familyID {
					belongs = true
					break
				}
			}
			if !belongs || s.Members == nil {
				return httpx.ErrNotFound("")
			}
			if _, active, err := s.Members.ActiveMember(ctx, familyID, userID); err != nil {
				return err
			} else if !active {
				return httpx.ErrNotFound("")
			}
		}
		if !pet.Archived() {
			previewTZ, tzErr := time.LoadLocation(defaultCareTimezone)
			if tzErr != nil {
				return tzErr
			}
			var candidates []ruleCandidate
			if familyID != "" {
				candidates, err = s.Repo.ListRulesForPetInFamily(ctx, tx, petID, familyID)
			} else {
				candidates, err = s.Repo.ListRulesForPet(ctx, tx, petID)
			}
			if err != nil {
				return err
			}
			previewStart := dateAt(time.Now(), previewTZ)
			if err := s.materializePetWindow(ctx, tx, candidates, previewStart, previewStart.AddDate(0, 0, carePlanPreviewDays)); err != nil {
				return err
			}
		}
		out, err = s.Repo.ListByPet(ctx, tx, petID, familyID, includeArchived)
		return err
	})
	return out, httpx.MapDBErr(err)
}

func (s *Service) ListAssignments(ctx context.Context, itemID, userID, familyID string) ([]CareAssignment, error) {
	var out []CareAssignment
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		item, err := s.Repo.ResolveItem(ctx, tx, itemID)
		if err != nil {
			return err
		}
		if _, _, err := s.requireCarePlanMemberInTx(ctx, tx, item, userID, false); err != nil {
			return err
		}
		if item.FamilyID != "" && familyID != "" && familyID != item.FamilyID {
			return httpx.ErrNotFound("")
		}
		out, err = s.Repo.ListAssignments(ctx, tx, item.ID)
		return err
	})
	return out, httpx.MapDBErr(err)
}

// requireCarePlanMemberInTx keeps Family-owned care plans inside their Family
// ACL. Pet ownership alone is not enough: a shared Pet can expose several
// independent care systems, each with its own members and responsibilities.
func (s *Service) requireCarePlanMemberInTx(ctx context.Context, q db.Q, item CarePlan, userID string, write bool) (contracts.Pet, contracts.Member, error) {
	if item.FamilyID == "" {
		pet, member, err := s.Guard.RequirePetInTx(ctx, q, item.PetID, userID, true, true)
		return pet, member, err
	}
	// Ask the Pet guard only for asset existence/access. Its aggregate role can
	// be ambiguous when the same user has different roles in several Families;
	// the plan's Family membership below is the authoritative role for this
	// operation.
	pet, member, err := s.Guard.RequirePetInTx(ctx, q, item.PetID, userID, false, false)
	if err != nil {
		return pet, member, err
	}
	if s.Members == nil {
		return pet, member, httpx.ErrNotFound("")
	}
	familyMember, active, err := s.Members.ActiveMember(ctx, item.FamilyID, userID)
	if err != nil {
		return pet, member, err
	}
	if !active {
		return pet, member, httpx.ErrNotFound("")
	}
	if write && (familyMember.Role == contracts.RoleViewer || familyMember.Role == contracts.RoleReadOnly) {
		return pet, member, httpx.ErrRoleForbidden()
	}
	if write && pet.Archived() {
		return pet, familyMember, httpx.ErrArchived()
	}
	var linked bool
	if err := q.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM family_pet_links WHERE family_id=$1 AND pet_id=$2 AND unlinked_at IS NULL AND deleted_at IS NULL)`, item.FamilyID, item.PetID).Scan(&linked); err != nil {
		return pet, familyMember, err
	}
	if !linked {
		return pet, familyMember, httpx.ErrNotFound("")
	}
	return pet, familyMember, nil
}

// requireCarePlanManagerInTx is stricter than occurrence execution. A
// caregiver can perform an assigned occurrence, but changing a Family-owned
// plan or its standing responsibility chain belongs to that Family's owner.
// The Pet owner remains a manager for a Family-owned plan; legacy Pet-owned
// plans retain Pet-owner control.
func (s *Service) requireCarePlanManagerInTx(ctx context.Context, q db.Q, item CarePlan, userID string) (contracts.Pet, contracts.Member, error) {
	pet, member, err := s.requireCarePlanMemberInTx(ctx, q, item, userID, true)
	if err != nil {
		return pet, member, err
	}
	if item.FamilyID != "" && pet.CurrentOwnerUserID != userID && member.Role != contracts.RoleOwner {
		return pet, member, httpx.ErrRoleForbidden()
	}
	return pet, member, nil
}

func (s *Service) SetAssignment(ctx context.Context, itemID, ownerID, targetUserID, role string) (CareAssignment, error) {
	if role == "" {
		role = "helper"
	}
	if role != "helper" {
		return CareAssignment{}, httpx.ErrValidation("role must be helper")
	}
	if targetUserID == "" || targetUserID == ownerID {
		return CareAssignment{}, httpx.ErrValidation("user_id must be another user")
	}
	var out CareAssignment
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		item, err := s.Repo.ResolveItem(ctx, tx, itemID)
		if err != nil {
			return err
		}
		if _, _, err := s.requireCarePlanManagerInTx(ctx, tx, item, ownerID); err != nil {
			return err
		}
		if item.FamilyID != "" {
			allowed, err := s.Repo.UserCanParticipateInFamily(ctx, tx, item.FamilyID, targetUserID)
			if err != nil {
				return err
			}
			if !allowed {
				return httpx.ErrNotFound("user does not participate in this Family")
			}
		}
		allowed, err := s.Repo.UserCanParticipateInPet(ctx, tx, item.PetID, targetUserID)
		if err != nil {
			return err
		}
		if !allowed {
			return httpx.ErrNotFound("user does not have access to this Pet")
		}
		if err := s.Repo.Assign(ctx, tx, item.ID, targetUserID, role, ownerID); err != nil {
			return err
		}
		assignments, err := s.Repo.ListAssignments(ctx, tx, item.ID)
		if err != nil {
			return err
		}
		for _, assignment := range assignments {
			if assignment.UserID == targetUserID {
				out = assignment
				break
			}
		}
		if out.UserID == "" {
			return httpx.ErrNotFound("assignment not found")
		}
		metadata := carePlanAuditMetadata(item)
		metadata["target_user_id"] = targetUserID
		metadata["role"] = role
		if err := platformaudit.Record(ctx, tx, ownerID, "care_assignment_added", "care_plan", item.ID, metadata); err != nil {
			return err
		}
		return nil
	})
	return out, httpx.MapDBErr(err)
}

func (s *Service) MoveAssignment(ctx context.Context, itemID, ownerID, targetUserID, direction string) (CareAssignment, error) {
	return s.MoveAssignmentWithIdempotency(ctx, itemID, ownerID, targetUserID, direction, "")
}

func (s *Service) MoveAssignmentWithIdempotency(ctx context.Context, itemID, ownerID, targetUserID, direction, idempotencyKey string) (CareAssignment, error) {
	if direction != "up" && direction != "down" {
		return CareAssignment{}, httpx.ErrValidation("direction must be up or down")
	}
	var out CareAssignment
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		item, err := s.Repo.ResolveItem(ctx, tx, itemID)
		if err != nil {
			return err
		}
		if _, _, err := s.requireCarePlanManagerInTx(ctx, tx, item, ownerID); err != nil {
			return err
		}
		claim, err := db.ClaimIdempotency(ctx, tx, ownerID, "care-assignment-move:"+item.ID, idempotencyKey, db.RequestHash(targetUserID, direction))
		if errors.Is(err, db.ErrIdempotencyKeyReused) {
			return httpx.NewAppError(http.StatusConflict, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different request")
		}
		if err != nil {
			return err
		}
		if claim.Replay {
			assignments, listErr := s.Repo.ListAssignments(ctx, tx, item.ID)
			if listErr != nil {
				return listErr
			}
			for _, assignment := range assignments {
				if assignment.UserID == targetUserID {
					out = assignment
					return nil
				}
			}
			return httpx.ErrNotFound("assignment not found")
		}
		beforeAssignments, err := s.Repo.ListAssignments(ctx, tx, item.ID)
		if err != nil {
			return err
		}
		beforePriority := -1
		for _, assignment := range beforeAssignments {
			if assignment.UserID == targetUserID {
				beforePriority = assignment.Priority
				break
			}
		}
		if err := s.Repo.MoveAssignment(ctx, tx, item.ID, targetUserID, direction); err != nil {
			return err
		}
		assignments, err := s.Repo.ListAssignments(ctx, tx, item.ID)
		if err != nil {
			return err
		}
		for _, assignment := range assignments {
			if assignment.UserID == targetUserID {
				out = assignment
				if beforePriority != -1 && out.Priority != beforePriority {
					metadata := carePlanAuditMetadata(item)
					metadata["target_user_id"] = targetUserID
					metadata["direction"] = direction
					if err := platformaudit.Record(ctx, tx, ownerID, "care_assignment_reordered", "care_plan", item.ID, metadata); err != nil {
						return err
					}
				}
				return db.BindIdempotency(ctx, tx, ownerID, "care-assignment-move:"+item.ID, idempotencyKey, "care_assignment", item.ID)
			}
		}
		return httpx.ErrNotFound("assignment not found")
	})
	return out, httpx.MapDBErr(err)
}

func (s *Service) RemoveAssignment(ctx context.Context, itemID, ownerID, targetUserID string) error {
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		item, err := s.Repo.ResolveItem(ctx, tx, itemID)
		if err != nil {
			return err
		}
		if _, _, err := s.requireCarePlanManagerInTx(ctx, tx, item, ownerID); err != nil {
			return err
		}
		role, err := s.Repo.DeleteAssignment(ctx, tx, item.ID, targetUserID)
		if errors.Is(err, pgx.ErrNoRows) {
			return httpx.ErrNotFound("assignment not found")
		}
		if err != nil {
			return err
		}
		if role == "owner" {
			return httpx.NewAppError(409, "CARE_ASSIGNMENT_OWNER_REQUIRED", "the care plan must keep an owner assignment")
		}
		metadata := carePlanAuditMetadata(item)
		metadata["target_user_id"] = targetUserID
		metadata["role"] = role
		if err := platformaudit.Record(ctx, tx, ownerID, "care_assignment_removed", "care_plan", item.ID, metadata); err != nil {
			return err
		}
		return nil
	})
	return httpx.MapDBErr(err)
}

// Update and Delete are compatibility operations on the CarePlan identified
// by the old task/template id. Family-owned plans are managed by that
// Family's owner/caregiver; legacy Pet-owned plans retain Pet-owner control.
func (s *Service) Update(ctx context.Context, itemID, userID, title string, titleSet bool, description string, descriptionSet bool, frequency []byte, timeOfDay *time.Time, timeOfDaySet bool, archive *bool, statusOverride string, now time.Time) (Task, error) {
	if titleSet {
		title = strings.TrimSpace(title)
		if err := validateTitle(title); err != nil {
			return Task{}, err
		}
	}
	var out Task
	var cancellationNotices []contracts.CareRequestCancellationNotice
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		item, err := s.Repo.ResolveItem(ctx, tx, itemID)
		if err != nil {
			return err
		}
		canonicalItemID := item.ID
		if _, _, err := s.requireCarePlanManagerInTx(ctx, tx, item, userID); err != nil {
			return err
		}
		previousStatus := item.Status
		previousTitle := item.Title
		if len(frequency) > 0 {
			if _, err := ParseSchedule(frequency); err != nil {
				return err
			}
		}
		status := statusOverride
		if status == "" && archive != nil {
			if *archive {
				status = "archived"
			} else {
				status = "active"
			}
		}
		if _, err = s.Repo.UpdateItem(ctx, tx, canonicalItemID, "", title, description, descriptionSet, status); err != nil {
			return err
		}
		rule, err := s.Repo.GetRuleByItem(ctx, tx, canonicalItemID)
		if err != nil {
			return err
		}
		if len(frequency) > 0 {
			if err := ValidateScheduleTransition(rule.Frequency, frequency); err != nil {
				return err
			}
		}
		if _, err = s.Repo.UpdateRule(ctx, tx, rule.ID, frequency, timeOfDay, timeOfDaySet, time.Time{}, rule.EndDate); err != nil {
			return err
		}
		item, err = s.Repo.GetItem(ctx, tx, canonicalItemID)
		if err != nil {
			return err
		}
		rule, err = s.Repo.GetRuleByItem(ctx, tx, canonicalItemID)
		if err != nil {
			return err
		}
		// A care task is a snapshot. Once the plan changes, open future
		// occurrences generated from the old rule are invalid; completed history
		// is preserved and the next Today query materializes the new snapshot.
		ruleTZ, err := time.LoadLocation(rule.Timezone)
		if err != nil {
			return httpx.ErrValidation("care rule timezone invalid")
		}
		canceledOccurrenceIDs, err := s.Repo.DeleteOpenTasksForRuleFromDate(ctx, tx, rule.ID, dateAt(now, ruleTZ))
		if err != nil {
			return err
		}
		for _, occurrenceID := range canceledOccurrenceIDs {
			if err := s.closeRequestsForOccurrence(ctx, tx, occurrenceID, userID, "照护计划已更新", &cancellationNotices); err != nil {
				return err
			}
		}
		// Updating a plan invalidates the open snapshot, but an active plan must
		// still have a same-day occurrence immediately after restore/edit. Do not
		// make the user wait for a second Today request to recreate the action.
		if item.Status == "active" {
			_, materializeErr := s.materializeCandidate(ctx, tx, ruleCandidateFrom(item, rule, userID), dateAt(now, ruleTZ), ruleTZ)
			if materializeErr != nil && !errors.Is(materializeErr, pgx.ErrNoRows) {
				return materializeErr
			}
		}
		out, err = s.Repo.compatibilityItemTask(ctx, tx, item, rule)
		if err != nil {
			return err
		}
		action := "care_plan_updated"
		if previousStatus != item.Status {
			switch {
			case item.Status == "archived":
				action = "care_plan_archived"
			case previousStatus == "archived" && item.Status == "active":
				action = "care_plan_restored"
			}
		}
		metadata := carePlanAuditMetadata(item)
		metadata["status_from"] = previousStatus
		metadata["status_to"] = item.Status
		metadata["title_changed"] = previousTitle != item.Title
		metadata["schedule_changed"] = len(frequency) > 0 || timeOfDaySet
		if err := platformaudit.Record(ctx, tx, userID, action, "care_plan", item.ID, metadata); err != nil {
			return err
		}
		return err
	})
	if err == nil {
		s.notifyCareRequestCancellations(ctx, cancellationNotices)
	}
	return out, httpx.MapDBErr(err)
}

func (s *Service) Delete(ctx context.Context, itemID, userID string, now time.Time) error {
	var cancellationNotices []contracts.CareRequestCancellationNotice
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		item, err := s.Repo.ResolveItem(ctx, tx, itemID)
		if err != nil {
			return err
		}
		canonicalItemID := item.ID
		if _, _, err := s.requireCarePlanManagerInTx(ctx, tx, item, userID); err != nil {
			return err
		}
		rule, err := s.Repo.GetRuleByItem(ctx, tx, canonicalItemID)
		if err != nil {
			return err
		}
		ruleTZ, err := time.LoadLocation(rule.Timezone)
		if err != nil {
			return httpx.ErrValidation("care rule timezone invalid")
		}
		// DELETE keeps completed history, but future open occurrences are no
		// longer real work. Cancel them before archiving the plan and close any
		// outstanding handoff cards in the same transaction.
		occurrenceIDs, err := s.Repo.DeleteOpenTasksForRuleFromDate(ctx, tx, rule.ID, dateAt(now, ruleTZ))
		if err != nil {
			return err
		}
		for _, occurrenceID := range occurrenceIDs {
			if err := s.closeRequestsForOccurrence(ctx, tx, occurrenceID, userID, "照护计划已删除", &cancellationNotices); err != nil {
				return err
			}
		}
		// A care plan is user-owned history. The compatibility DELETE endpoint
		// must never cascade through occurrences and erase completed history; DELETE
		// therefore has archive semantics, matching PATCH {"archived":true}.
		_, err = s.Repo.UpdateItem(ctx, tx, canonicalItemID, "", "", "", false, "archived")
		if err != nil {
			return err
		}
		metadata := carePlanAuditMetadata(item)
		metadata["status_from"] = item.Status
		metadata["status_to"] = "archived"
		return platformaudit.Record(ctx, tx, userID, "care_plan_archived", "care_plan", canonicalItemID, metadata)
	})
	if err == nil {
		s.notifyCareRequestCancellations(ctx, cancellationNotices)
	}
	return httpx.MapDBErr(err)
}

type TodayPetGroup struct {
	PetID   string
	PetName string
	Items   []TodayItem
}
type TodayItem struct {
	Task           Task
	AssignedToName *string
	DoneByName     *string
	Log            *TaskLog
	CareRequest    *CareRequestSummary
}

func (s *Service) Today(ctx context.Context, familyID, userID, dateStr string, now time.Time) (string, []TodayPetGroup, error) {
	tzName, err := s.Members.FamilyTimezone(ctx, familyID)
	if err != nil {
		return "", nil, err
	}
	tz, err := time.LoadLocation(tzName)
	if err != nil {
		return "", nil, httpx.ErrValidation("family timezone invalid")
	}
	today := dateAt(now, tz)
	date := today
	if dateStr != "" {
		date, err = time.ParseInLocation("2006-01-02", dateStr, tz)
		if err != nil {
			return "", nil, httpx.ErrValidation("date must be YYYY-MM-DD")
		}
	}
	if date.After(today) {
		return "", nil, httpx.ErrValidation("future dates are not allowed")
	}
	if civilDayDistance(today, date, tz) > viewBackfillDays {
		return "", nil, httpx.ErrValidation("history limited to the past 30 days")
	}
	// 成员判定在事务内重做：Today 会物化 occurrence 并标记 missed（写路径），
	// 不能对着授权前的快照角色做写（与 RequirePetInTx 同一防 TOCTOU 契约）。
	var rows []TodayRow
	err = db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		var ok bool
		if err := tx.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM family_memberships m
				JOIN families c ON c.id = m.family_id AND c.deleted_at IS NULL
				WHERE m.family_id = $1 AND m.user_id = $2
				  AND m.status='active' AND m.ended_at IS NULL AND m.deleted_at IS NULL
			)`, familyID, userID).Scan(&ok); err != nil {
			return err
		}
		if !ok {
			return httpx.ErrNotFound("")
		}
		if err := s.materializeFamily(ctx, tx, familyID, date); err != nil {
			return err
		}
		dayStart := dateAt(date, tz)
		dayEnd := dayStart.AddDate(0, 0, 1)
		if err := s.Repo.MarkMissedBeforeFamilyAt(ctx, tx, familyID, dayStart); err != nil {
			return err
		}
		var err error
		rows, err = s.Repo.TodayRowsInWindow(ctx, tx, familyID, dayStart, dayEnd)
		return err
	})
	if err != nil {
		return "", nil, httpx.MapDBErr(err)
	}
	return date.Format("2006-01-02"), groupRows(rows), nil
}

// TodayForPet is the canonical Pet-filtered Today query. The filter is an
// application query parameter; it does not create a domain context object.
func (s *Service) TodayForPet(ctx context.Context, petID, userID, dateStr string, now time.Time) (string, []TodayPetGroup, error) {
	_, _, err := s.Guard.RequirePet(ctx, petID, false, false)
	if err != nil {
		return "", nil, err
	}
	var rows []TodayRow
	var date time.Time
	err = db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		// 事务内重做授权（Today 会物化+标记 missed，是写路径）。
		if _, _, err := s.Guard.RequirePetInTx(ctx, tx, petID, userID, false, false); err != nil {
			return err
		}
		candidates, err := s.Repo.ListRulesForPet(ctx, tx, petID)
		if err != nil {
			return err
		}
		// A Pet-filtered Today still needs one civil-day boundary. Prefer the
		// pet's primary Family (the single live 'primary' link) so the boundary
		// follows the household, not whichever rule sorts first; fall back to
		// the rule snapshot timezone when there is no primary Family.
		familyTimezone := ""
		if s.Members != nil {
			var primaryTZ string
			if err := tx.QueryRow(ctx, `
				SELECT c.timezone FROM family_pet_links fp
				JOIN families c ON c.id = fp.family_id AND c.deleted_at IS NULL
				WHERE fp.pet_id = $1 AND fp.relationship_type = 'primary'
				  AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL
				ORDER BY fp.linked_at LIMIT 1`, petID).Scan(&primaryTZ); err == nil && primaryTZ != "" {
				familyTimezone = primaryTZ
			} else if !errors.Is(err, pgx.ErrNoRows) {
				return err
			}
		}
		tzName := petTodayTimezoneName(familyTimezone, candidates)
		tz, err := time.LoadLocation(tzName)
		if err != nil {
			return httpx.ErrValidation("care rule timezone invalid")
		}
		today := dateAt(now, tz)
		date = today
		if dateStr != "" {
			date, err = time.ParseInLocation("2006-01-02", dateStr, tz)
			if err != nil {
				return httpx.ErrValidation("date must be YYYY-MM-DD")
			}
		}
		if date.After(today) {
			return httpx.ErrValidation("future dates are not allowed")
		}
		if civilDayDistance(today, date, tz) > viewBackfillDays {
			return httpx.ErrValidation("history limited to the past 30 days")
		}
		dayStart := dateAt(date, tz)
		dayEnd := dayStart.AddDate(0, 0, 1)
		if err := s.materializePetWindow(ctx, tx, candidates, dayStart, dayEnd); err != nil {
			return err
		}
		if err := s.Repo.MarkMissedBeforePetAt(ctx, tx, petID, dayStart); err != nil {
			return err
		}
		rows, err = s.Repo.TodayRowsForPetInWindow(ctx, tx, petID, dayStart, dayEnd)
		return err
	})
	if err != nil {
		return "", nil, httpx.MapDBErr(err)
	}
	return date.Format("2006-01-02"), groupRows(rows), nil
}

// TodayForPetInFamily is the explicit Pet+Family view. A Pet may be linked to
// households in different timezones; the selected Family edge must define the
// civil day instead of silently falling back to the primary edge or device.
func (s *Service) TodayForPetInFamily(ctx context.Context, familyID, petID, userID, dateStr string, now time.Time) (string, []TodayPetGroup, error) {
	tzName, err := s.Members.FamilyTimezone(ctx, familyID)
	if err != nil {
		return "", nil, err
	}
	tz, err := time.LoadLocation(tzName)
	if err != nil {
		return "", nil, httpx.ErrValidation("family timezone invalid")
	}
	today := dateAt(now, tz)
	date := today
	if dateStr != "" {
		date, err = time.ParseInLocation("2006-01-02", dateStr, tz)
		if err != nil {
			return "", nil, httpx.ErrValidation("date must be YYYY-MM-DD")
		}
	}
	if date.After(today) {
		return "", nil, httpx.ErrValidation("future dates are not allowed")
	}
	if civilDayDistance(today, date, tz) > viewBackfillDays {
		return "", nil, httpx.ErrValidation("history limited to the past 30 days")
	}

	var rows []TodayRow
	err = db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		var member bool
		if err := tx.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM family_memberships m
				JOIN families c ON c.id = m.family_id AND c.deleted_at IS NULL
				WHERE m.family_id = $1 AND m.user_id = $2
				  AND m.status='active' AND m.ended_at IS NULL AND m.deleted_at IS NULL
			)`, familyID, userID).Scan(&member); err != nil {
			return err
		}
		if !member {
			return httpx.ErrNotFound("")
		}
		pet, _, err := s.Guard.RequirePetInTx(ctx, tx, petID, userID, false, false)
		if err != nil {
			return err
		}
		belongs := false
		for _, linkedFamilyID := range pet.FamilyIDs {
			if linkedFamilyID == familyID {
				belongs = true
				break
			}
		}
		if !belongs {
			return httpx.ErrNotFound("")
		}
		candidates, err := s.Repo.ListRulesForPetInFamily(ctx, tx, petID, familyID)
		if err != nil {
			return err
		}
		dayStart := dateAt(date, tz)
		dayEnd := dayStart.AddDate(0, 0, 1)
		if err := s.materializePetWindow(ctx, tx, candidates, dayStart, dayEnd); err != nil {
			return err
		}
		if err := s.Repo.MarkMissedBeforeFamilyPetAt(ctx, tx, familyID, petID, dayStart); err != nil {
			return err
		}
		rows, err = s.Repo.TodayRowsForFamilyPetInWindow(ctx, tx, familyID, petID, dayStart, dayEnd)
		return err
	})
	if err != nil {
		return "", nil, httpx.MapDBErr(err)
	}
	return date.Format("2006-01-02"), groupRows(rows), nil
}

// TodayAll is the user-scoped aggregate used by the All Pets view. Family is
// the care boundary: a shared Pet is read once per visible Family edge, then
// those rows are merged back into one Pet card. This keeps a Family-owned plan
// and its timezone attached to the Family that owns it. A directly-owned Pet
// with no visible Family edge retains the legacy Pet-scoped path.
func (s *Service) TodayAll(ctx context.Context, userID, dateStr string, now time.Time) (string, []TodayPetGroup, error) {
	if s.AccessiblePets == nil || s.AccessibleFamilies == nil {
		return "", nil, httpx.NewAppError(500, "TODAY_AGGREGATE_UNAVAILABLE", "aggregate Today is not configured")
	}
	pets, err := s.AccessiblePets(ctx, userID)
	if err != nil {
		return "", nil, err
	}
	families, err := s.AccessibleFamilies(ctx, userID)
	if err != nil {
		return "", nil, err
	}
	date := ""
	groups := make([]TodayPetGroup, 0, len(pets))
	visibleFamilyIDs := make(map[string]bool, len(families))
	for _, family := range families {
		visibleFamilyIDs[family.ID] = true
	}
	for _, pet := range pets {
		visibleEdges := make([]string, 0, len(pet.FamilyIDs))
		for _, familyID := range pet.FamilyIDs {
			if visibleFamilyIDs[familyID] {
				visibleEdges = append(visibleEdges, familyID)
			}
		}
		if len(visibleEdges) == 0 {
			petDate, petGroups, err := s.TodayForPet(ctx, pet.ID, userID, dateStr, now)
			if err != nil {
				return "", nil, err
			}
			if date == "" {
				date = petDate
			}
			groups = mergeTodayGroups(groups, petGroups)
			continue
		}
		for _, familyID := range visibleEdges {
			familyDate, familyGroups, err := s.TodayForPetInFamily(ctx, familyID, pet.ID, userID, dateStr, now)
			if err != nil {
				return "", nil, err
			}
			if date == "" {
				date = familyDate
			}
			groups = mergeTodayGroups(groups, familyGroups)
		}
	}
	return date, groups, nil
}

func mergeTodayGroups(existing, incoming []TodayPetGroup) []TodayPetGroup {
	if len(incoming) == 0 {
		return existing
	}
	index := make(map[string]int, len(existing))
	for i, group := range existing {
		index[group.PetID] = i
	}
	for _, group := range incoming {
		if i, ok := index[group.PetID]; ok {
			existing[i].Items = append(existing[i].Items, group.Items...)
			continue
		}
		index[group.PetID] = len(existing)
		existing = append(existing, group)
	}
	return existing
}

// petTodayTimezoneName chooses the timezone snapshot carried by the Pet's
// care rules. A Pet has no primary Family, so a filtered Pet view cannot
// derive its civil day from a Family pointer.
func petTodayTimezoneName(familyTimezone string, candidates []ruleCandidate) string {
	if familyTimezone != "" {
		return familyTimezone
	}
	for _, candidate := range candidates {
		if candidate.Timezone != "" {
			return candidate.Timezone
		}
	}
	return defaultCareTimezone
}

func groupRows(rows []TodayRow) []TodayPetGroup {
	groups := []TodayPetGroup{}
	idx := map[string]int{}
	for _, row := range rows {
		i, ok := idx[row.PetID]
		if !ok {
			groups = append(groups, TodayPetGroup{PetID: row.PetID, PetName: row.PetName})
			i = len(groups) - 1
			idx[row.PetID] = i
		}
		groups[i].Items = append(groups[i].Items, TodayItem{Task: row.Task, AssignedToName: row.AssignedToName, DoneByName: row.DoneByName, Log: row.Log, CareRequest: row.CareRequest})
	}
	return groups
}

func (s *Service) TodayForShare(ctx context.Context, familyID string, now time.Time) ([]contracts.SharedTodayGroup, error) {
	tzName, err := s.Members.FamilyTimezone(ctx, familyID)
	if err != nil {
		return nil, err
	}
	tz, err := time.LoadLocation(tzName)
	if err != nil {
		return nil, err
	}
	date := dateAt(now, tz)
	var rows []TodayRow
	err = db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		if err := s.materializeFamily(ctx, tx, familyID, date); err != nil {
			return err
		}
		dayStart := dateAt(date, tz)
		dayEnd := dayStart.AddDate(0, 0, 1)
		var err error
		rows, err = s.Repo.TodayRowsInWindow(ctx, tx, familyID, dayStart, dayEnd)
		return err
	})
	if err != nil {
		return nil, err
	}
	return sharedTodayRows(rows, tzName), nil
}

func (s *Service) TodayForPetShare(ctx context.Context, petID string, now time.Time) ([]contracts.SharedTodayGroup, error) {
	var rows []TodayRow
	tzName := defaultCareTimezone
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		candidates, err := s.Repo.ListRulesForPet(ctx, tx, petID)
		if err != nil {
			return err
		}
		// A Pet-level share still needs one civil-day boundary. Use the live
		// primary Family edge when present; choosing candidates[0] is unstable
		// for a pet linked to multiple families with different timezones.
		tzName = ""
		var primaryTimezone string
		primaryErr := tx.QueryRow(ctx, `
			SELECT f.timezone
			FROM family_pet_links fp
			JOIN families f ON f.id = fp.family_id AND f.deleted_at IS NULL
			WHERE fp.pet_id = $1
			  AND fp.relationship_type = 'primary'
			  AND fp.unlinked_at IS NULL
			  AND fp.deleted_at IS NULL
			ORDER BY fp.linked_at
			LIMIT 1`, petID).Scan(&primaryTimezone)
		if primaryErr != nil && !errors.Is(primaryErr, pgx.ErrNoRows) {
			return primaryErr
		}
		if primaryTimezone != "" {
			tzName = primaryTimezone
		} else if len(candidates) > 0 && candidates[0].Timezone != "" {
			tzName = candidates[0].Timezone
		} else {
			tzName = defaultCareTimezone
		}
		tz, err := time.LoadLocation(tzName)
		if err != nil {
			return err
		}
		date := dateAt(now, tz)
		dayEnd := date.AddDate(0, 0, 1)
		if err := s.materializePetWindow(ctx, tx, candidates, date, dayEnd); err != nil {
			return err
		}
		rows, err = s.Repo.TodayRowsForPetInWindow(ctx, tx, petID, date, dayEnd)
		return err
	})
	if err != nil {
		return nil, err
	}
	return sharedTodayRows(rows, tzName), nil
}

func sharedTodayRows(rows []TodayRow, timezone string) []contracts.SharedTodayGroup {
	groups := []contracts.SharedTodayGroup{}
	idx := map[string]int{}
	for _, row := range rows {
		i, ok := idx[row.PetID]
		if !ok {
			groups = append(groups, contracts.SharedTodayGroup{PetID: row.PetID, PetName: row.PetName, Timezone: timezone})
			i = len(groups) - 1
			idx[row.PetID] = i
		}
		item := contracts.SharedTodayItem{Title: row.Title}
		if row.TimeOfDay != nil {
			value := row.TimeOfDay.Format("15:04")
			item.TimeOfDay = &value
		}
		if row.Log != nil {
			status := row.Log.Status
			item.LogStatus = &status
			if row.DoneByName != nil {
				item.DoneByName = row.DoneByName
			}
		}
		groups[i].Items = append(groups[i].Items, item)
	}
	return groups
}

func (s *Service) TodayForDigest(ctx context.Context, familyID, dateStr string, now time.Time) (string, string, []contracts.DigestPetGroup, error) {
	date, groups, err := s.TodayWithoutAuth(ctx, familyID, dateStr, now)
	if err != nil {
		return "", "", nil, err
	}
	tz, err := s.Members.FamilyTimezone(ctx, familyID)
	if err != nil {
		return "", "", nil, err
	}
	out := make([]contracts.DigestPetGroup, 0, len(groups))
	for _, group := range groups {
		g := contracts.DigestPetGroup{PetID: group.PetID, PetName: group.PetName}
		for _, item := range group.Items {
			d := contracts.DigestTaskItem{
				OccurrenceID: item.Task.ID,
				Title:        item.Task.Title,
				Status:       "pending",
			}
			if item.CareRequest != nil {
				d.CareRequestID = item.CareRequest.ID
				d.CareRequestState = item.CareRequest.State
			}
			if item.Task.TimeOfDay != nil {
				v := item.Task.TimeOfDay.Format("15:04")
				d.TimeOfDay = &v
			}
			if item.Log != nil {
				d.Status = item.Log.Status
				if d.Status == "completed" {
					d.Status = "done" // legacy digest presentation contract
				}
				d.DoneAt = &item.Log.DoneAt
				if item.DoneByName != nil {
					d.DoneByName = *item.DoneByName
				}
			}
			g.Items = append(g.Items, d)
		}
		out = append(out, g)
	}
	return date, tz, out, nil
}

func (s *Service) TodayWithoutAuth(ctx context.Context, familyID, dateStr string, now time.Time) (string, []TodayPetGroup, error) {
	tzName, err := s.Members.FamilyTimezone(ctx, familyID)
	if err != nil {
		return "", nil, err
	}
	tz, err := time.LoadLocation(tzName)
	if err != nil {
		return "", nil, err
	}
	today := dateAt(now, tz)
	date := today
	if dateStr != "" {
		date, err = time.ParseInLocation("2006-01-02", dateStr, tz)
		if err != nil {
			return "", nil, httpx.ErrValidation("date must be YYYY-MM-DD")
		}
		// 未来日期曾能把全圈"尚未到点"的 pending 批量打成 missed
		// （MarkMissedBeforeFamilyAt 以未来日界为阈值）。Today/TodayForPet
		// 都有守卫，这条 digest/调度路径必须有同一道。
		if date.After(today) {
			return "", nil, httpx.ErrValidation("future dates are not allowed")
		}
		// 只读回看同样有界（与 Today 的 30 天视图窗一致）：手动补发任意久远
		// 的 digest 会触发对规则生命周期内任意旧日期的物化写放大。
		if civilDayDistance(today, date, tz) > viewBackfillDays {
			return "", nil, httpx.ErrValidation("history limited to the past 30 days")
		}
	}
	var rows []TodayRow
	err = db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		if err := s.materializeFamily(ctx, tx, familyID, date); err != nil {
			return err
		}
		dayStart := dateAt(date, tz)
		dayEnd := dayStart.AddDate(0, 0, 1)
		if err := s.Repo.MarkMissedBeforeFamilyAt(ctx, tx, familyID, dayStart); err != nil {
			return err
		}
		var e error
		rows, e = s.Repo.TodayRowsInWindow(ctx, tx, familyID, dayStart, dayEnd)
		return e
	})
	if err != nil {
		return "", nil, err
	}
	return date.Format("2006-01-02"), groupRows(rows), nil
}

func (s *Service) DueForReminder(ctx context.Context, familyID string, now time.Time) ([]contracts.DueTask, error) {
	date, rows, err := s.TodayWithoutAuth(ctx, familyID, "", now)
	_ = date
	if err != nil {
		return nil, err
	}
	out := []contracts.DueTask{}
	for _, group := range rows {
		for _, item := range group.Items {
			if item.Log != nil || item.Task.TimeOfDay == nil || item.Task.Status != "pending" {
				continue
			}
			tod := item.Task.TimeOfDay
			out = append(out, contracts.DueTask{TaskID: item.Task.ID, PetID: item.Task.PetID, Title: item.Task.Title, TimeOfDayMinutes: tod.Hour()*60 + tod.Minute()})
		}
	}
	return out, nil
}

// UnassignedCareRisks returns due occurrences with no current owner. An open
// Care Request is still a risk: a request waiting for a response does not mean
// the pet is covered. The scheduler applies durable hourly de-duplication.
// This unfiltered form is intentionally kept for the scheduler, which must
// continue seeing overdue risks across civil dates.
func (s *Service) UnassignedCareRisks(ctx context.Context, familyID string, now time.Time) ([]contracts.CareRisk, error) {
	return s.unassignedCareRisks(ctx, familyID, now, nil)
}

// UnassignedCareRisksForDate is the Today projection. It limits risks to the
// selected Family-local civil date so an overdue item from yesterday cannot
// appear beside today's occurrence and contradict its current assignment.
func (s *Service) UnassignedCareRisksForDate(ctx context.Context, familyID, dateStr string, now time.Time) ([]contracts.CareRisk, error) {
	if _, err := time.Parse("2006-01-02", dateStr); err != nil {
		return nil, httpx.ErrValidation("date must be YYYY-MM-DD")
	}
	return s.unassignedCareRisks(ctx, familyID, now, &dateStr)
}

func (s *Service) unassignedCareRisks(ctx context.Context, familyID string, now time.Time, civilDate *string) ([]contracts.CareRisk, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT co.id::text, co.pet_id::text, p.name,
		       COALESCE(NULLIF(co.title_snapshot,''), cp.title), co.due_at,
		       f.timezone,
		       COALESCE((
				SELECT r.id::text FROM care_requests r
				WHERE r.occurrence_id=co.id AND r.state IN ('sent','seen') AND r.deleted_at IS NULL
				ORDER BY r.created_at DESC, r.id DESC LIMIT 1
		       ), ''),
		       EXISTS (
				SELECT 1 FROM care_requests expired_request
				WHERE expired_request.occurrence_id=co.id
				  AND expired_request.state='expired'
				  AND expired_request.deleted_at IS NULL
				  AND NOT EXISTS (
						SELECT 1 FROM care_requests newer_request
						WHERE newer_request.occurrence_id=co.id
						  AND (newer_request.created_at > expired_request.created_at OR
						       (newer_request.created_at = expired_request.created_at AND newer_request.id > expired_request.id))
						  AND newer_request.deleted_at IS NULL
				  )
		       )
		FROM families f
		JOIN care_occurrences co ON true
		JOIN care_plans cp ON cp.id=co.care_plan_id
		JOIN pets p ON p.id=co.pet_id
		WHERE f.id=$1 AND (co.assigned_to_user_id IS NULL OR EXISTS (
				SELECT 1 FROM care_requests waiting_request
				WHERE waiting_request.occurrence_id=co.id
				  AND waiting_request.state IN ('sent','seen')
				  AND waiting_request.deleted_at IS NULL
		) OR EXISTS (
				SELECT 1 FROM care_requests latest_expired
				WHERE latest_expired.occurrence_id=co.id
				  AND latest_expired.state='expired'
				  AND latest_expired.deleted_at IS NULL
				  AND NOT EXISTS (
						SELECT 1 FROM care_requests newer_request
						WHERE newer_request.occurrence_id=co.id
						  AND (newer_request.created_at > latest_expired.created_at OR
						       (newer_request.created_at = latest_expired.created_at AND newer_request.id > latest_expired.id))
						  AND newer_request.deleted_at IS NULL
				  )
		))
		  AND co.status IN ('pending','missed')
		  AND co.due_at IS NOT NULL
		  AND co.due_at <= ($2::timestamptz + interval '60 minutes')
		  AND ($3::date IS NULL OR (
				co.due_at >= ($3::date::timestamp AT TIME ZONE COALESCE(NULLIF(f.timezone,''),'UTC'))
				AND co.due_at < (($3::date + 1)::timestamp AT TIME ZONE COALESCE(NULLIF(f.timezone,''),'UTC'))
		  ))
		  AND EXISTS (
				SELECT 1 FROM family_pet_links fp
				WHERE fp.family_id=$1 AND fp.pet_id=co.pet_id
				  AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL
		  )
		  AND co.deleted_at IS NULL AND cp.deleted_at IS NULL AND p.deleted_at IS NULL
		ORDER BY co.due_at, p.name, cp.title
		LIMIT 50`, familyID, now.UTC(), civilDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []contracts.CareRisk{}
	for rows.Next() {
		var risk contracts.CareRisk
		if err := rows.Scan(&risk.OccurrenceID, &risk.PetID, &risk.PetName, &risk.Title, &risk.DueAt, &risk.FamilyTimezone, &risk.RequestID, &risk.EscalationFailed); err != nil {
			return nil, err
		}
		risk.WaitingOnUser = risk.RequestID != ""
		out = append(out, risk)
	}
	return out, rows.Err()
}

func (s *Service) CompleteTask(ctx context.Context, taskID, userID, status, dateStr, note string, now time.Time) (TaskLog, error) {
	return s.CompleteTaskWithIdempotency(ctx, taskID, userID, status, dateStr, note, now, "")
}

// CompleteTaskWithIdempotency makes a care action safe to retry after a
// timeout. The idempotency claim and the task state change share one
// transaction, so a committed action can always be replayed by the same user.
func (s *Service) CompleteTaskWithIdempotency(ctx context.Context, taskID, userID, status, dateStr, note string, now time.Time, idempotencyKey string) (TaskLog, error) {
	if status != "done" && status != "skipped" {
		return TaskLog{}, httpx.ErrValidation("status must be done|skipped")
	}
	// The public API uses "done"; the durable task state uses the domain
	// status "completed". Normalize once at the application boundary so the
	// database constraint, timeline payload, and response all agree.
	storedStatus := status
	if storedStatus == "done" {
		storedStatus = "completed"
	}
	if len(note) > 500 {
		return TaskLog{}, httpx.ErrValidation("note too long")
	}
	var logEntry TaskLog
	var replayed bool
	var cancellationNotices []contracts.CareRequestCancellationNotice
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		task, err := s.Repo.GetForUpdate(ctx, tx, taskID)
		if err != nil {
			return httpx.MapDBErr(err)
		}
		_, member, err := s.requireCarePlanMemberInTx(ctx, tx, CarePlan{ID: task.CarePlanID, PetID: task.PetID, FamilyID: task.FamilyID}, userID, true)
		if err != nil {
			return err
		}
		if s.CareRequests != nil {
			acceptedForOther, requestErr := s.CareRequests.AcceptedForOther(ctx, tx, task.ID, userID)
			if requestErr != nil {
				return requestErr
			}
			if acceptedForOther {
				return httpx.NewAppError(409, "CARE_OCCURRENCE_ASSIGNED", "only the current caregiver can complete this occurrence")
			}
			openForTarget, requestErr := s.CareRequests.OpenForTarget(ctx, tx, task.ID, userID)
			if requestErr != nil {
				return requestErr
			}
			if openForTarget {
				return httpx.NewAppError(409, "CARE_REQUEST_RESPONSE_REQUIRED", "please respond to the care request before completing this occurrence")
			}
		}
		if member.Role == contracts.RoleCaregiver {
			// A care-request acceptance is a one-occurrence handoff. It must
			// authorize the accepting caregiver for this occurrence without
			// silently changing the plan's standing collaborators.
			assignedToOccurrence := task.AssignedTo != nil && *task.AssignedTo == userID
			if !assignedToOccurrence {
				assigned, assignmentErr := s.Repo.UserAssignedToPlan(ctx, tx, task.CarePlanID, userID)
				if assignmentErr != nil {
					return assignmentErr
				}
				if !assigned {
					return httpx.ErrRoleForbidden()
				}
			}
		}
		claim, err := db.ClaimIdempotency(ctx, tx, userID, "care-task-complete:"+taskID, idempotencyKey,
			db.RequestHash(taskID, storedStatus, dateStr, note))
		if errors.Is(err, db.ErrIdempotencyKeyReused) {
			return httpx.NewAppError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different request")
		}
		if err != nil {
			return err
		}
		if claim.Replay {
			replayed = true
			logEntry, err = s.Repo.GetTaskLog(ctx, tx, claim.ResourceID)
			return err
		}
		if task.ArchivedAt != nil {
			return httpx.NewAppError(409, "CARE_PLAN_ARCHIVED", "care plan is archived")
		}
		// 裸 occurrence ID 路径同样受 7 天回填窗约束（带 dateStr 的路径下方另
		// 有校验）。放在幂等 claim 之后：旧命令的超时重试重放不受影响。
		if task.DueDate != nil {
			tz, e := time.LoadLocation(task.Timezone)
			if e != nil {
				tz = time.UTC
			}
			if civilDayDistance(dateAt(now, tz), dateAt(*task.DueDate, tz), tz) > backfillDays {
				return httpx.ErrValidation("backfill limited to the past 7 days")
			}
		}
		if dateStr != "" {
			tz, e := time.LoadLocation(task.Timezone)
			if e != nil {
				return httpx.ErrValidation("care rule timezone invalid")
			}
			requested, e := time.ParseInLocation("2006-01-02", dateStr, tz)
			if e != nil {
				return httpx.ErrValidation("date must be YYYY-MM-DD")
			}
			today := dateAt(now, tz)
			if requested.After(today) {
				return httpx.ErrValidation("future dates are not allowed")
			}
			if civilDayDistance(today, requested, tz) > backfillDays {
				return httpx.ErrValidation("backfill limited to the past 7 days")
			}
			if task.DueDate == nil || !sameDate(*task.DueDate, requested, tz) {
				rule, e := s.Repo.RuleForTask(ctx, tx, taskID)
				if e != nil {
					return e
				}
				candidate := ruleCandidate{ItemID: task.CarePlanID, RuleID: rule.ID, PetID: task.PetID, FamilyID: task.FamilyID, Frequency: rule.Frequency, StartDate: rule.StartDate, EndDate: rule.EndDate, TimeOfDay: rule.TimeOfDay, Timezone: rule.Timezone, AssignedTo: task.AssignedTo}
				materialized, e := s.materializeCandidate(ctx, tx, candidate, requested, tz)
				if errors.Is(e, pgx.ErrNoRows) {
					return httpx.ErrValidation("care plan is not scheduled on this date")
				} else if e != nil {
					return e
				}
				task = materialized
			}
		}
		if occurrenceIsFuture(task, now) {
			return httpx.ErrValidation("future occurrences cannot be completed")
		}
		logEntry, err = s.Repo.InsertLog(ctx, tx, task.ID, storedStatus, userID, note)
		if errors.Is(err, pgx.ErrNoRows) {
			// Preserve the sentinel so the outer transaction boundary can reload
			// and return the authoritative existing log after rollback.
			return err
		}
		if err != nil {
			return err
		}
		if s.Events != nil {
			payload, _ := json.Marshal(map[string]any{"care_task_id": task.ID, "care_plan_id": task.CarePlanID, "title": task.Title, "status": storedStatus, "dedupe": task.ID + ":" + logEntry.DoneAt.UTC().Format(time.RFC3339Nano)})
			if err := s.Events.RecordAuto(ctx, tx, task.FamilyID, task.PetID, "care_task_completed", logEntry.DoneAt, userID, contracts.SourceAutoCare, payload); err != nil {
				return err
			}
		}
		if s.CareRequests != nil {
			reason := "照护已完成"
			if storedStatus == "skipped" {
				reason = "照护事项已跳过"
			}
			canceled, cancelErr := s.CareRequests.CancelOpenForOccurrence(ctx, tx, task.ID, userID, reason)
			if cancelErr != nil {
				return cancelErr
			}
			cancellationNotices = append(cancellationNotices, canceled...)
		}
		if err := db.BindIdempotency(ctx, tx, userID, "care-task-complete:"+taskID, idempotencyKey, "task_log", logEntry.TaskID); err != nil {
			return err
		}
		return nil
	})
	if errors.Is(err, pgx.ErrNoRows) {
		authLog, e := s.Repo.LogForTaskDateWithName(ctx, s.Pool, taskID)
		if e != nil {
			return TaskLog{}, httpx.ErrTaskLogExists(nil)
		}
		return TaskLog{}, httpx.ErrTaskLogExists(logWithNameDTO(authLog))
	}
	if err == nil && !replayed && storedStatus == "completed" {
		excluded := make(map[string]bool, len(cancellationNotices))
		for _, notice := range cancellationNotices {
			excluded[notice.UserID] = true
		}
		s.notifyCareCompletionExcept(ctx, taskID, userID, excluded)
	}
	if err == nil && !replayed {
		s.notifyCareRequestCancellations(ctx, cancellationNotices)
	}
	return logEntry, httpx.MapDBErr(err)
}

func (s *Service) notifyCareRequestCancellations(ctx context.Context, notices []contracts.CareRequestCancellationNotice) {
	if s.Notifier == nil {
		return
	}
	for _, notice := range notices {
		_ = s.Notifier.NotifyUserData(ctx, notice.UserID,
			notice.PetName+" 的照护请求已结束",
			notice.Body,
			"care_handoff", map[string]string{
				"kind":            "care_handoff",
				"care_request_id": notice.RequestID,
				"family_id":       notice.FamilyID,
				"pet_id":          notice.PetID,
			})
	}
}

func (s *Service) notifyCareCompletion(ctx context.Context, occurrenceID, actorID string) {
	s.notifyCareCompletionExcept(ctx, occurrenceID, actorID, nil)
}

func (s *Service) notifyCareCompletionExcept(ctx context.Context, occurrenceID, actorID string, excluded map[string]bool) {
	if s.Notifier == nil {
		return
	}
	recipients, err := s.Repo.CareCompletionRecipients(ctx, s.Pool, occurrenceID, actorID)
	if err != nil {
		return
	}
	for _, recipient := range recipients {
		if excluded != nil && excluded[recipient.UserID] {
			continue
		}
		_ = s.Notifier.NotifyUserData(ctx, recipient.UserID,
			recipient.PetName+" 的照护已完成",
			recipient.Title+" 已由 "+recipient.ActorName+" 完成",
			"care_completed", map[string]string{
				"kind":          "care_completed",
				"occurrence_id": occurrenceID,
			})
	}
}

func occurrenceIsFuture(task Task, now time.Time) bool {
	// 未来判定按民事日而不是 due_at 瞬时：当天提前完成（先记录后补全）是
	// 合法动线，只有"未来某天"的任务才不可完成。
	if task.DueAt == nil {
		return false
	}
	tz, err := time.LoadLocation(task.Timezone)
	if err != nil {
		tz = time.UTC
	}
	today := dateAt(now, tz)
	return dateAt(task.DueAt.In(tz), tz).After(today)
}

func sameDate(a, b time.Time, tz *time.Location) bool {
	aa, bb := a.In(tz), b.In(tz)
	return aa.Year() == bb.Year() && aa.YearDay() == bb.YearDay()
}

func civilDayDistance(later, earlier time.Time, tz *time.Location) int {
	a := later.In(tz)
	b := earlier.In(tz)
	ad := time.Date(a.Year(), a.Month(), a.Day(), 0, 0, 0, 0, time.UTC)
	bd := time.Date(b.Year(), b.Month(), b.Day(), 0, 0, 0, 0, time.UTC)
	return int(ad.Sub(bd) / (24 * time.Hour))
}

func (s *Service) Undo(ctx context.Context, logID, userID string) error {
	return s.UndoWithIdempotency(ctx, logID, userID, "")
}

// UndoWithIdempotency makes a retry safe when the client loses the response
// after the log and its undo fact have already committed. The idempotency
// claim is in the same transaction as the state change.
func (s *Service) UndoWithIdempotency(ctx context.Context, logID, userID, idempotencyKey string) error {
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		claim, err := db.ClaimIdempotency(ctx, tx, userID, "care-task-undo:"+logID, idempotencyKey,
			db.RequestHash(logID))
		if errors.Is(err, db.ErrIdempotencyKeyReused) {
			return httpx.NewAppError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different request")
		}
		if err != nil {
			return err
		}
		if claim.Replay {
			return nil
		}
		logEntry, err := s.Repo.GetTaskLogForUpdate(ctx, tx, logID)
		if err != nil {
			return httpx.MapDBErr(err)
		}
		task, err := s.Repo.GetForUpdate(ctx, tx, logEntry.TaskID)
		if err != nil {
			return err
		}
		_, member, err := s.requireCarePlanMemberInTx(ctx, tx, CarePlan{ID: task.CarePlanID, PetID: task.PetID, FamilyID: task.FamilyID}, userID, true)
		if err != nil {
			return err
		}
		if logEntry.DoneBy != userID && member.Role != contracts.RoleOwner {
			return httpx.ErrRoleForbidden()
		}
		// Undo 与补录同一时间观：完成后 7 天内可撤销，防止任意改写远古历史。
		undoTZ, e := time.LoadLocation(task.Timezone)
		if e != nil {
			undoTZ = time.UTC
		}
		now := time.Now().UTC()
		if civilDayDistance(dateAt(now, undoTZ), dateAt(logEntry.DoneAt, undoTZ), undoTZ) > backfillDays {
			return httpx.NewAppError(409, "UNDO_WINDOW_EXPIRED", "undo is limited to 7 days after completion")
		}
		if err := s.Repo.DeleteLog(ctx, tx, logID); err != nil {
			return err
		}
		if s.Events != nil {
			// The undo is a new fact that happened now, not a rewrite of the
			// original completion time. Keep it linked to the same occurrence
			// while preserving the actual order of actions in the timeline.
			payload, _ := json.Marshal(map[string]any{"care_task_id": task.ID, "title": task.Title, "status": "reverted", "dedupe": "undo:" + logID})
			if err := s.Events.RecordAuto(ctx, tx, task.FamilyID, task.PetID, "care_task_undone", now, userID, contracts.SourceAutoCare, payload); err != nil {
				return err
			}
		}
		return db.BindIdempotency(ctx, tx, userID, "care-task-undo:"+logID, idempotencyKey, "task_log_undo", logID)
	})
	return httpx.MapDBErr(err)
}

func logWithNameDTO(l TaskLogWithName) map[string]any {
	return map[string]any{"id": l.ID, "task_id": l.TaskID, "log_date": l.LogDate.Format("2006-01-02"), "status": l.Status, "done_by": l.DoneBy, "done_at": l.DoneAt, "note": l.Note, "done_by_name": l.DoneByName}
}

func logDTO(l TaskLog) map[string]any {
	return map[string]any{"id": l.ID, "task_id": l.TaskID, "log_date": l.LogDate.Format("2006-01-02"), "status": l.Status, "done_by": l.DoneBy, "done_at": l.DoneAt, "note": l.Note}
}

// CareStatsScope 决定统计的宠物集合:单宠 / 家庭可见集 / 用户全部可访问集。
type CareStatsScope struct {
	FamilyID string
	PetID    string
}

// CareStats 是区间照护执行的服务端事实:分母含 missed(该做没做),
// 只统计已过去或当日的日子,未来 pending 不进完成率。
func (s *Service) CareStats(ctx context.Context, userID string, scope CareStatsScope, fromStr, toStr string, now time.Time) (map[string]any, error) {
	from, err := time.Parse("2006-01-02", fromStr)
	if err != nil {
		return nil, httpx.ErrValidation("from must be YYYY-MM-DD")
	}
	to, err := time.Parse("2006-01-02", toStr)
	if err != nil {
		return nil, httpx.ErrValidation("to must be YYYY-MM-DD")
	}
	if to.Before(from) {
		return nil, httpx.ErrValidation("to must not be before from")
	}
	if to.Sub(from).Hours() > 400*24 {
		return nil, httpx.ErrValidation("range too long (max 400 days)")
	}

	var pets []contracts.Pet
	switch {
	case scope.PetID != "" && scope.FamilyID != "":
		return nil, httpx.ErrValidation("exactly one of family_id or pet_id is required")
	case scope.PetID != "":
		petRow, _, err := s.Guard.RequirePet(ctx, scope.PetID, false, false)
		if err != nil {
			return nil, err
		}
		pets = []contracts.Pet{{ID: scope.PetID, Name: petRow.Name}}
	case scope.FamilyID != "":
		// 家庭口径先做成员判定（非成员一律 404，与 Today 一致）。
		if _, ok, err := s.Members.ActiveMember(ctx, scope.FamilyID, userID); err != nil {
			return nil, err
		} else if !ok {
			return nil, httpx.ErrNotFound("")
		}
		pets, err = s.Repo.ListFamilyPetsForUser(ctx, s.Pool, scope.FamilyID)
		if err != nil {
			return nil, err
		}
	default:
		if s.AccessiblePets == nil {
			return nil, httpx.NewAppError(500, "CARE_STATS_UNAVAILABLE", "aggregate care stats are not configured")
		}
		pets, err = s.AccessiblePets(ctx, userID)
		if err != nil {
			return nil, err
		}
	}
	if len(pets) == 0 {
		// 键名与非空路径严格一致（"rate"）：前端只读 rate，空集曾返回
		// completion_rate 导致纪念场景渲染 "undefined%"。
		return map[string]any{"from": fromStr, "to": toStr, "total": 0, "completed": 0, "skipped": 0, "missed": 0, "rate": nil, "per_pet": []map[string]any{}, "per_day": []map[string]any{}}, nil
	}

	ids := make([]string, len(pets))
	names := make(map[string]string, len(pets))
	for i, pet := range pets {
		ids[i] = pet.ID
		names[pet.ID] = pet.Name
	}

	days, err := s.Repo.ListCareStats(ctx, s.Pool, ids, from, to)
	if err != nil {
		return nil, err
	}

	total, completed, skipped, missed := 0, 0, 0, 0
	perPet := map[string]*struct{ t, c, k, m int }{}
	type dayAgg struct{ total, c, k, m int }
	dayMap := make(map[string]*dayAgg)
	var dayOrder []string
	for _, day := range days {
		total += day.Total
		completed += day.Completed
		skipped += day.Skipped
		missed += day.Missed
		agg := perPet[day.PetID]
		if agg == nil {
			agg = &struct{ t, c, k, m int }{}
			perPet[day.PetID] = agg
		}
		agg.t += day.Total
		agg.c += day.Completed
		agg.k += day.Skipped
		agg.m += day.Missed
		d := dayMap[day.Date]
		if d == nil {
			d = &dayAgg{}
			dayMap[day.Date] = d
			dayOrder = append(dayOrder, day.Date)
		}
		d.total += day.Total
		d.c += day.Completed
		d.k += day.Skipped
		d.m += day.Missed
	}
	perDay := make([]map[string]any, 0, len(dayOrder))
	for _, date := range dayOrder {
		d := dayMap[date]
		perDay = append(perDay, map[string]any{
			"date": date, "total": d.total,
			"completed": d.c, "skipped": d.k, "missed": d.m,
		})
	}

	petList := make([]map[string]any, 0, len(perPet))
	for id, agg := range perPet {
		rate := petRate(agg.t, agg.c+agg.k)
		petList = append(petList, map[string]any{
			"pet_id": id, "pet_name": names[id],
			"total": agg.t, "completed": agg.c, "skipped": agg.k, "missed": agg.m,
			"handled": agg.c + agg.k, "rate": rate,
		})
	}

	return map[string]any{
		"from": fromStr, "to": toStr,
		"total": total, "completed": completed, "skipped": skipped, "missed": missed,
		"handled": completed + skipped,
		"rate":    petRate(total, completed+skipped),
		"per_pet": petList, "per_day": perDay,
	}, nil
}

func petRate(total, handled int) any {
	if total == 0 {
		return nil
	}
	return math.Round(float64(handled)/float64(total)*1000) / 10
}
