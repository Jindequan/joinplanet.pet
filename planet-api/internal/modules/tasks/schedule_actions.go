package tasks

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/joinplanet/planet-api/internal/contracts"
	"github.com/joinplanet/planet-api/internal/platform/db"
	"github.com/joinplanet/planet-api/internal/platform/httpx"
)

type ScheduleSlot struct {
	CareRuleID string `json:"care_rule_id"`
	CarePlanID string `json:"care_plan_id"`
	Date       string `json:"date"` // YYYY-MM-DD civil date in rule timezone
}

type ScheduleActionRequest struct {
	Action  string          `json:"action"`
	Scope   string          `json:"scope"`
	Slot    ScheduleSlot    `json:"slot"`
	Payload json.RawMessage `json:"payload"`
	// idempotencyKey is supplied by the HTTP boundary and intentionally never
	// appears in JSON. Every action in the transaction must consume the same
	// command key, including non-creating overrides and rule changes.
	idempotencyKey string
	// cancellationNotices carries post-commit notification work out of the
	// caller-owned transaction. Request state and occurrence state still commit
	// atomically; delivery must never be part of that transaction.
	cancellationNotices *[]contracts.CareRequestCancellationNotice
}

type ScheduleActionResult struct {
	Override *ScheduleOverride `json:"override,omitempty"`
	Task     *Task             `json:"task,omitempty"`
	Rule     *CareRule         `json:"care_rule,omitempty"`
}

func (s *Service) ApplyScheduleAction(ctx context.Context, userID string, req ScheduleActionRequest, now time.Time, idempotencyKey string) (ScheduleActionResult, error) {
	req.idempotencyKey = idempotencyKey
	var cancellationNotices []contracts.CareRequestCancellationNotice
	req.cancellationNotices = &cancellationNotices
	switch req.Action {
	case "skip", "move", "substitute":
		if req.Scope != "this" {
			return ScheduleActionResult{}, httpx.ErrValidation("scope must be this for " + req.Action)
		}
	case "add":
		if req.Scope != "this" {
			return ScheduleActionResult{}, httpx.ErrValidation("scope must be this for add")
		}
	case "change_rule":
		if req.Scope != "from_date" && req.Scope != "rule" {
			return ScheduleActionResult{}, httpx.ErrValidation("scope must be from_date or rule for change_rule")
		}
	default:
		return ScheduleActionResult{}, httpx.ErrValidation("action must be skip|move|add|substitute|change_rule")
	}

	var out ScheduleActionResult
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		switch req.Action {
		case "skip":
			return s.actionSkip(ctx, tx, userID, req, now, &out)
		case "move":
			return s.actionMove(ctx, tx, userID, req, now, &out)
		case "add":
			return s.actionAdd(ctx, tx, userID, req, now, idempotencyKey, "", &out)
		case "substitute":
			return s.actionSubstitute(ctx, tx, userID, req, now, idempotencyKey, &out)
		case "change_rule":
			return s.actionChangeRule(ctx, tx, userID, req, now, &out)
		default:
			return httpx.ErrValidation("unsupported action")
		}
	})
	if err == nil {
		s.notifyCareRequestCancellations(ctx, cancellationNotices)
	}
	return out, httpx.MapDBErr(err)
}

// closeRequestsForOccurrence keeps the single Occurrence responsibility
// chain authoritative when a schedule override removes the occurrence.
// Completion already uses the same carecoord operation; schedule changes must
// not leave a stale inbox card behind.
func (s *Service) closeRequestsForOccurrence(ctx context.Context, tx pgx.Tx, occurrenceID, userID, reason string, notices *[]contracts.CareRequestCancellationNotice) error {
	if occurrenceID == "" || s.CareRequests == nil || notices == nil {
		return nil
	}
	canceled, err := s.CareRequests.CancelOpenForOccurrence(ctx, tx, occurrenceID, userID, reason)
	if err != nil {
		return err
	}
	*notices = append(*notices, canceled...)
	return nil
}

// validateSlotWindow：skip/move/add/substitute 的日期界限——过去最多 7 天
// （与补录同窗，防止追溯改写更早的统计事实），未来最多 366 天。
func validateSlotWindow(date time.Time, tz *time.Location, now time.Time) error {
	today := dateAt(now, tz)
	slot := dateAt(date, tz)
	if civilDayDistance(today, slot, tz) > backfillDays {
		return httpx.ErrValidation("slot date beyond the 7-day backfill window")
	}
	if slot.Sub(today).Hours() > 366*24 {
		return httpx.ErrValidation("slot date too far in the future")
	}
	return nil
}

func (s *Service) actionSkip(ctx context.Context, tx pgx.Tx, userID string, req ScheduleActionRequest, now time.Time, out *ScheduleActionResult) error {
	rule, slotDate, tz, err := s.resolveSlot(ctx, tx, userID, req.Slot, true)
	if err != nil {
		return err
	}
	if err := validateSlotWindow(slotDate, tz, now); err != nil {
		return err
	}
	scope := scheduleOverrideIdempotencyScope("skip", rule.ID, slotDate)
	claim, err := db.ClaimIdempotency(ctx, tx, userID, scope, req.idempotencyKey, scheduleActionHash(req, slotDate))
	if errors.Is(err, db.ErrIdempotencyKeyReused) {
		return httpx.NewAppError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different request")
	}
	if err != nil {
		return err
	}
	if claim.Replay {
		override, replayErr := s.Repo.GetOverrideByID(ctx, tx, claim.ResourceID)
		if replayErr != nil {
			return replayErr
		}
		out.Override = &override
		return nil
	}
	var body struct {
		Note string `json:"note"`
	}
	_ = json.Unmarshal(req.Payload, &body)
	item, err := s.Repo.GetItem(ctx, tx, rule.CarePlanID)
	if err != nil {
		return err
	}
	var occurrenceID string
	if task, err := s.Repo.OccurrenceForSlot(ctx, tx, rule.ID, slotDate); err == nil {
		if task.Status == "completed" || task.Status == "skipped" {
			return httpx.ErrValidation("cannot skip a completed occurrence")
		}
		occurrenceID = task.ID
	}
	ov, err := s.Repo.UpsertOverride(ctx, tx, rule.ID, item.PetID, slotDate, "skip", nil, nil, body.Note, userID)
	if err != nil {
		return err
	}
	canceledOccurrenceID, err := s.Repo.CancelOpenOccurrenceForSlot(ctx, tx, rule.ID, slotDate)
	if err != nil {
		return err
	}
	if occurrenceID == "" {
		occurrenceID = canceledOccurrenceID
	}
	if err := s.closeRequestsForOccurrence(ctx, tx, occurrenceID, userID, "照护事项已从今天安排中移除", req.cancellationNotices); err != nil {
		return err
	}
	out.Override = &ov
	if err := db.BindIdempotency(ctx, tx, userID, scope, req.idempotencyKey, "care_schedule_override", ov.ID); err != nil {
		return err
	}
	_ = tz
	_ = now
	return nil
}

func (s *Service) actionMove(ctx context.Context, tx pgx.Tx, userID string, req ScheduleActionRequest, now time.Time, out *ScheduleActionResult) error {
	rule, slotDate, tz, err := s.resolveSlot(ctx, tx, userID, req.Slot, true)
	if err != nil {
		return err
	}
	if err := validateSlotWindow(slotDate, tz, now); err != nil {
		return err
	}
	scope := scheduleOverrideIdempotencyScope("move", rule.ID, slotDate)
	claim, err := db.ClaimIdempotency(ctx, tx, userID, scope, req.idempotencyKey, scheduleActionHash(req, slotDate))
	if errors.Is(err, db.ErrIdempotencyKeyReused) {
		return httpx.NewAppError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different request")
	}
	if err != nil {
		return err
	}
	if claim.Replay {
		override, replayErr := s.Repo.GetOverrideByID(ctx, tx, claim.ResourceID)
		if replayErr != nil {
			return replayErr
		}
		out.Override = &override
		if task, taskErr := s.Repo.OccurrenceForSlot(ctx, tx, rule.ID, slotDate); taskErr == nil {
			out.Task = &task
		} else if !errors.Is(taskErr, pgx.ErrNoRows) {
			return taskErr
		}
		return nil
	}
	var body struct {
		TimeOfDay string `json:"time_of_day"`
	}
	if err := json.Unmarshal(req.Payload, &body); err != nil || body.TimeOfDay == "" {
		return httpx.ErrValidation("payload.time_of_day is required (HH:MM)")
	}
	parsed, err := time.Parse("15:04", body.TimeOfDay)
	if err != nil {
		return httpx.ErrValidation("time_of_day must be HH:MM")
	}
	due := dueAt(slotDate, &parsed, tz)
	item, err := s.Repo.GetItem(ctx, tx, rule.CarePlanID)
	if err != nil {
		return err
	}
	if task, err := s.Repo.OccurrenceForSlot(ctx, tx, rule.ID, slotDate); err == nil {
		if task.Status == "completed" || task.Status == "skipped" {
			return httpx.ErrValidation("cannot move a completed occurrence")
		}
		if err := s.Repo.UpdateOccurrenceDueAt(ctx, tx, task.ID, due, &parsed); err != nil {
			return err
		}
		refreshed, err := s.Repo.Get(ctx, tx, task.ID)
		if err != nil {
			return err
		}
		task = refreshed
		out.Task = &task
	}
	ov, err := s.Repo.UpsertOverride(ctx, tx, rule.ID, item.PetID, slotDate, "move", &due, nil, "", userID)
	if err != nil {
		return err
	}
	out.Override = &ov
	if err := db.BindIdempotency(ctx, tx, userID, scope, req.idempotencyKey, "care_schedule_override", ov.ID); err != nil {
		return err
	}
	_ = now
	return nil
}

func (s *Service) actionAdd(ctx context.Context, tx pgx.Tx, userID string, req ScheduleActionRequest, now time.Time, idempotencyKey, forcedTimezone string, out *ScheduleActionResult) error {
	var body struct {
		PetID     string `json:"pet_id"`
		FamilyID  string `json:"family_id"`
		Title     string `json:"title"`
		Type      string `json:"type"`
		Date      string `json:"date"`
		TimeOfDay string `json:"time_of_day"`
	}
	if err := json.Unmarshal(req.Payload, &body); err != nil {
		return httpx.ErrValidation("invalid payload")
	}
	if body.PetID == "" || body.Title == "" || body.Date == "" {
		return httpx.ErrValidation("payload requires pet_id, title, date")
	}
	if body.Type == "" {
		body.Type = "custom"
	}
	if err := validateTitle(body.Title); err != nil {
		return err
	}
	if err := validateCareType(body.Type); err != nil {
		return err
	}
	d, err := time.Parse("2006-01-02", body.Date)
	if err != nil {
		return httpx.ErrValidation("date must be YYYY-MM-DD")
	}
	slotDate := time.Date(d.Year(), d.Month(), d.Day(), 12, 0, 0, 0, time.UTC)
	pet, _, err := s.Guard.RequirePetInTx(ctx, tx, body.PetID, userID, false, true)
	if err != nil {
		return err
	}
	timezone := forcedTimezone
	if timezone == "" {
		timezone, err = careTimezoneForPet(ctx, pet, body.FamilyID, userID, s.Members)
		if err != nil {
			return err
		}
	}
	planFamilyID := body.FamilyID
	if planFamilyID == "" && len(pet.FamilyIDs) == 1 {
		planFamilyID = pet.FamilyIDs[0]
	}
	tz, err := time.LoadLocation(timezone)
	if err != nil {
		return httpx.ErrValidation("pet timezone invalid")
	}
	if err := validateSlotWindow(slotDate, tz, now); err != nil {
		return err
	}
	// add 是创建型命令：Idempotency-Key 必须真正消费（HTTP 层强制要求该
	// header），超时重试不允许再建一份一次性任务。
	scope := "schedule-add:" + body.PetID
	claim, err := db.ClaimIdempotency(ctx, tx, userID, scope, idempotencyKey, db.RequestHash(string(req.Payload)))
	if err != nil {
		if errors.Is(err, db.ErrIdempotencyKeyReused) {
			return httpx.NewAppError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different request")
		}
		return err
	}
	if claim.Replay {
		return s.replayScheduleCreation(ctx, tx, claim.ResourceID, out)
	}
	var tod *time.Time
	if body.TimeOfDay != "" {
		parsed, err := time.Parse("15:04", body.TimeOfDay)
		if err != nil {
			return httpx.ErrValidation("time_of_day must be HH:MM")
		}
		tod = &parsed
	}
	freq, err := json.Marshal(map[string]any{"v": 1, "kind": "once", "date": body.Date})
	if err != nil {
		return err
	}
	if _, err := ParseSchedule(freq); err != nil {
		return err
	}
	civilStart := civilDateAt(slotDate, tz)
	civilEnd := civilStart
	item, err := s.Repo.CreateItem(ctx, tx, body.PetID, planFamilyID, body.Type, body.Title, "", "", userID)
	if err != nil {
		return err
	}
	rule, err := s.Repo.CreateRule(ctx, tx, item.ID, freq, civilStart, &civilEnd, tod, timezone, userID)
	if err != nil {
		return err
	}
	if err := s.Repo.Assign(ctx, tx, item.ID, userID, "owner", userID); err != nil {
		return err
	}
	item, err = s.Repo.GetItem(ctx, tx, item.ID)
	if err != nil {
		return err
	}
	task, err := s.materializeCandidate(ctx, tx, ruleCandidateFrom(item, rule, userID), civilStart, tz)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	if err == nil {
		out.Task = &task
	}
	_ = now
	return db.BindIdempotency(ctx, tx, userID, scope, idempotencyKey, "care_plan", item.ID)
}

// replayScheduleCreation 重放 add/substitute 的创建结果：按绑定的计划取回
// 当前规则与首个 occurrence（substitute 的 replace override 在重放时省略，
// 任务与规则是权威结果）。
func (s *Service) replayScheduleCreation(ctx context.Context, tx pgx.Tx, planID string, out *ScheduleActionResult) error {
	rule, err := s.Repo.GetRuleByItem(ctx, tx, planID)
	if err != nil {
		return httpx.MapDBErr(err)
	}
	out.Rule = &rule
	if task, taskErr := s.Repo.GetFirstTaskForRule(ctx, tx, rule.ID); taskErr == nil {
		out.Task = &task
	} else if !errors.Is(taskErr, pgx.ErrNoRows) {
		return taskErr
	}
	return nil
}

func (s *Service) actionSubstitute(ctx context.Context, tx pgx.Tx, userID string, req ScheduleActionRequest, now time.Time, idempotencyKey string, out *ScheduleActionResult) error {
	var body struct {
		Title     string `json:"title"`
		Type      string `json:"type"`
		TimeOfDay string `json:"time_of_day"`
		Note      string `json:"note"`
	}
	if err := json.Unmarshal(req.Payload, &body); err != nil || body.Title == "" {
		return httpx.ErrValidation("payload.title is required")
	}
	if err := s.actionSkip(ctx, tx, userID, req, now, out); err != nil {
		return err
	}
	rule, slotDate, _, err := s.resolveSlot(ctx, tx, userID, req.Slot, false)
	if err != nil {
		return err
	}
	item, err := s.Repo.GetItem(ctx, tx, rule.CarePlanID)
	if err != nil {
		return err
	}
	addPayload, _ := json.Marshal(map[string]any{
		"pet_id":      item.PetID,
		"title":       body.Title,
		"type":        defaultStr(body.Type, "custom"),
		"date":        slotDate.Format("2006-01-02"),
		"time_of_day": body.TimeOfDay,
	})
	addReq := ScheduleActionRequest{Action: "add", Scope: "this", Payload: addPayload}
	var addOut ScheduleActionResult
	if err := s.actionAdd(ctx, tx, userID, addReq, now, idempotencyKey, rule.Timezone, &addOut); err != nil {
		return err
	}
	if addOut.Task != nil && out.Override != nil {
		repID := addOut.Task.CarePlanID
		ov, err := s.Repo.UpsertOverride(ctx, tx, rule.ID, item.PetID, slotDate, "replace", nil, &repID, body.Note, userID)
		if err != nil {
			return err
		}
		out.Override = &ov
		out.Task = addOut.Task
	}
	return nil
}

func (s *Service) actionChangeRule(ctx context.Context, tx pgx.Tx, userID string, req ScheduleActionRequest, now time.Time, out *ScheduleActionResult) error {
	if req.Slot.CarePlanID == "" {
		return httpx.ErrValidation("slot.care_plan_id is required")
	}
	item, err := s.Repo.ResolveItem(ctx, tx, req.Slot.CarePlanID)
	if err != nil {
		return httpx.MapDBErr(err)
	}
	if _, _, err := s.requireCarePlanManagerInTx(ctx, tx, item, userID); err != nil {
		return err
	}
	oldRule, err := s.Repo.GetRuleByItem(ctx, tx, item.ID)
	if err != nil {
		return err
	}
	tz, err := time.LoadLocation(oldRule.Timezone)
	if err != nil {
		return httpx.ErrValidation("care rule timezone invalid")
	}
	var body struct {
		EffectiveFrom string          `json:"effective_from"`
		Schedule      json.RawMessage `json:"schedule"`
		TimeOfDay     json.RawMessage `json:"time_of_day"`
	}
	if err := json.Unmarshal(req.Payload, &body); err != nil {
		return httpx.ErrValidation("invalid payload")
	}
	effectiveFrom := civilDateAt(dateAt(now, tz), tz)
	if body.EffectiveFrom != "" {
		d, err := time.Parse("2006-01-02", body.EffectiveFrom)
		if err != nil {
			return httpx.ErrValidation("effective_from must be YYYY-MM-DD")
		}
		effectiveFrom = civilDateAt(time.Date(d.Year(), d.Month(), d.Day(), 12, 0, 0, 0, time.UTC), tz)
	}
	frequency := oldRule.Frequency
	if len(body.Schedule) > 0 {
		frequency = body.Schedule
		if err := ValidateScheduleTransition(oldRule.Frequency, frequency); err != nil {
			return err
		}
	}
	var tod *time.Time = oldRule.TimeOfDay
	timeOfDaySet := len(body.TimeOfDay) > 0
	if timeOfDaySet {
		var value *string
		if err := json.Unmarshal(body.TimeOfDay, &value); err != nil {
			return httpx.ErrValidation("time_of_day must be HH:MM or null")
		}
		if value == nil || *value == "" {
			tod = nil
		} else {
			parsed, err := time.Parse("15:04", *value)
			if err != nil {
				return httpx.ErrValidation("time_of_day must be HH:MM or null")
			}
			tod = &parsed
		}
	}
	scope := scheduleRuleIdempotencyScope(item.ID, effectiveFrom)
	claim, err := db.ClaimIdempotency(ctx, tx, userID, scope, req.idempotencyKey, scheduleActionHash(req, effectiveFrom))
	if errors.Is(err, db.ErrIdempotencyKeyReused) {
		return httpx.NewAppError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different request")
	}
	if err != nil {
		return err
	}
	if claim.Replay {
		rule, replayErr := s.Repo.GetRule(ctx, tx, claim.ResourceID)
		if replayErr != nil {
			return replayErr
		}
		out.Rule = &rule
		return nil
	}
	startCivil := civilDateAt(oldRule.StartDate, tz)
	// Same-day or retroactive changes update the current rule in place to avoid
	// overlapping EXCLUDE constraints on care_rules.
	if !effectiveFrom.After(startCivil) {
		updated, err := s.Repo.UpdateRule(ctx, tx, oldRule.ID, frequency, tod, timeOfDaySet, startCivil, oldRule.EndDate)
		if err != nil {
			return err
		}
		canceledOccurrenceIDs, err := s.Repo.DeleteOpenTasksForRuleFromDate(ctx, tx, oldRule.ID, dateAt(now, tz))
		if err != nil {
			return err
		}
		for _, occurrenceID := range canceledOccurrenceIDs {
			if err := s.closeRequestsForOccurrence(ctx, tx, occurrenceID, userID, "照护规则已更新", req.cancellationNotices); err != nil {
				return err
			}
		}
		item, err = s.Repo.GetItem(ctx, tx, item.ID)
		if err != nil {
			return err
		}
		if item.Status == "active" {
			candidate := ruleCandidateFrom(item, updated, userID)
			_, _ = s.materializeCandidate(ctx, tx, candidate, dateAt(now, tz), tz)
		}
		out.Rule = &updated
		if err := db.BindIdempotency(ctx, tx, userID, scope, req.idempotencyKey, "care_rule", updated.ID); err != nil {
			return err
		}
		return nil
	}
	closeDay := effectiveFrom.AddDate(0, 0, -1)
	if err := s.Repo.CloseRuleAt(ctx, tx, oldRule.ID, closeDay); err != nil {
		return err
	}
	newRule, err := s.Repo.CreateRule(ctx, tx, item.ID, frequency, effectiveFrom, oldRule.EndDate, tod, oldRule.Timezone, userID)
	if err != nil {
		return err
	}
	deleteFrom := effectiveFrom
	if calendarKey(effectiveFrom, tz) <= calendarKey(now, tz) {
		deleteFrom = dateAt(now, tz)
	}
	canceledOccurrenceIDs, err := s.Repo.DeleteOpenTasksForRuleFromDate(ctx, tx, oldRule.ID, deleteFrom)
	if err != nil {
		return err
	}
	for _, occurrenceID := range canceledOccurrenceIDs {
		if err := s.closeRequestsForOccurrence(ctx, tx, occurrenceID, userID, "照护规则已更新", req.cancellationNotices); err != nil {
			return err
		}
	}
	if item.Status == "active" && calendarKey(effectiveFrom, tz) <= calendarKey(now, tz) {
		candidate := ruleCandidateFrom(item, newRule, userID)
		_, _ = s.materializeCandidate(ctx, tx, candidate, dateAt(now, tz), tz)
	}
	out.Rule = &newRule
	if err := db.BindIdempotency(ctx, tx, userID, scope, req.idempotencyKey, "care_rule", newRule.ID); err != nil {
		return err
	}
	return nil
}

func scheduleOverrideIdempotencyScope(action, ruleID string, slotDate time.Time) string {
	return "schedule-" + action + ":" + ruleID + ":" + slotDate.Format("2006-01-02")
}

func scheduleRuleIdempotencyScope(planID string, effectiveFrom time.Time) string {
	return "schedule-change-rule:" + planID + ":" + effectiveFrom.Format("2006-01-02")
}

func scheduleActionHash(req ScheduleActionRequest, date time.Time) string {
	return db.RequestHash(req.Action, req.Scope, req.Slot.CareRuleID, req.Slot.CarePlanID, date.Format("2006-01-02"), string(req.Payload))
}

func (s *Service) resolveSlot(ctx context.Context, tx pgx.Tx, userID string, slot ScheduleSlot, requireWrite bool) (CareRule, time.Time, *time.Location, error) {
	if slot.CareRuleID == "" || slot.Date == "" {
		return CareRule{}, time.Time{}, nil, httpx.ErrValidation("slot.care_rule_id and slot.date are required")
	}
	rule, err := s.Repo.GetRule(ctx, tx, slot.CareRuleID)
	if err != nil {
		return CareRule{}, time.Time{}, nil, httpx.MapDBErr(err)
	}
	item, err := s.Repo.GetItem(ctx, tx, rule.CarePlanID)
	if err != nil {
		return CareRule{}, time.Time{}, nil, err
	}
	var member contracts.Member
	if requireWrite {
		_, member, err = s.requireCarePlanMemberInTx(ctx, tx, item, userID, true)
	} else {
		_, member, err = s.requireCarePlanMemberInTx(ctx, tx, item, userID, false)
	}
	if err != nil {
		return CareRule{}, time.Time{}, nil, err
	} else if member.Role == "caregiver" && requireWrite {
		assigned, err := s.Repo.UserAssignedToPlan(ctx, tx, item.ID, userID)
		if err != nil {
			return CareRule{}, time.Time{}, nil, err
		}
		if !assigned {
			return CareRule{}, time.Time{}, nil, httpx.ErrRoleForbidden()
		}
	}
	d, err := time.Parse("2006-01-02", slot.Date)
	if err != nil {
		return CareRule{}, time.Time{}, nil, httpx.ErrValidation("slot.date must be YYYY-MM-DD")
	}
	slotDate := time.Date(d.Year(), d.Month(), d.Day(), 12, 0, 0, 0, time.UTC)
	tz, err := time.LoadLocation(rule.Timezone)
	if err != nil {
		return CareRule{}, time.Time{}, nil, httpx.ErrValidation("care rule timezone invalid")
	}
	return rule, slotDate, tz, nil
}

func defaultStr(a, b string) string {
	if a != "" {
		return a
	}
	return b
}
