package tasks

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/joinplanet/planet-api/internal/contracts"
	"github.com/joinplanet/planet-api/internal/platform/clockx"
	"github.com/joinplanet/planet-api/internal/platform/httpx"
)

type Handler struct {
	Svc   *Service
	Clock clockx.Clock
}

func (h *Handler) Mount(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/v1/pets/{id}/care-plans", h.createCarePlan)
	mux.HandleFunc("GET /api/v1/pets/{id}/care-plans", h.list)
	mux.HandleFunc("PATCH /api/v1/care-plans/{id}", h.update)
	mux.HandleFunc("DELETE /api/v1/care-plans/{id}", h.delete)
	mux.HandleFunc("GET /api/v1/care-plans/{id}/assignments", h.listAssignments)
	mux.HandleFunc("PUT /api/v1/care-plans/{id}/assignments/{user_id}", h.setAssignment)
	mux.HandleFunc("POST /api/v1/care-plans/{id}/assignments/{user_id}/move", h.moveAssignment)
	mux.HandleFunc("DELETE /api/v1/care-plans/{id}/assignments/{user_id}", h.removeAssignment)
	mux.HandleFunc("POST /api/v1/care-schedule/actions", h.scheduleActions)
	mux.HandleFunc("POST /api/v1/care-tasks/{id}/complete", h.complete)
	mux.HandleFunc("POST /api/v1/pets/{id}/tasks", h.create)
	mux.HandleFunc("GET /api/v1/pets/{id}/tasks", h.list)
	mux.HandleFunc("PATCH /api/v1/tasks/{id}", h.update)
	mux.HandleFunc("DELETE /api/v1/tasks/{id}", h.delete)
	mux.HandleFunc("GET /api/v1/families/{id}/today", h.today)
	mux.HandleFunc("GET /api/v1/families/{id}/care-risks", h.careRisks)
	mux.HandleFunc("GET /api/v1/today", h.todayFilter)
	mux.HandleFunc("GET /api/v1/care-stats", h.careStats)
	mux.HandleFunc("POST /api/v1/tasks/{id}/logs", h.complete)
	mux.HandleFunc("POST /api/v1/task-logs/{id}/undo", h.undo)
}

func auth(r *http.Request) contracts.Auth {
	a, _ := contracts.AuthFrom(r.Context())
	return a
}

func parseTimeOfDay(s string) (*time.Time, error) {
	if s == "" {
		return nil, nil
	}
	t, err := time.Parse("15:04", s)
	if err != nil {
		return nil, httpx.ErrValidation("time_of_day must be HH:MM")
	}
	return &t, nil
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		key, err := httpx.RequireIdempotencyKey(r)
		if err != nil {
			return 0, nil, err
		}
		var body struct {
			FamilyID     string          `json:"family_id"`
			Title        string          `json:"title"`
			Schedule     json.RawMessage `json:"schedule"`
			TimeOfDay    string          `json:"time_of_day"`
			MedicationID string          `json:"medication_id"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		tod, err := parseTimeOfDay(body.TimeOfDay)
		if err != nil {
			return 0, nil, err
		}
		itemType := "custom"
		if body.MedicationID != "" {
			// 用药提醒计划：与 meds 档案联动（停药/删药自动归档本计划）。
			itemType = "medication"
		}
		result, err := h.Svc.CreateAtForMedicationWithFamily(r.Context(), r.PathValue("id"), auth(r).UserID,
			itemType, body.Title, "", body.MedicationID, body.Schedule, h.Clock.Now(), nil, tod, body.FamilyID, key)
		if err != nil {
			return 0, nil, err
		}
		t, err := compatibilityTaskResult(result, err)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusCreated, map[string]any{"task": taskDTO(t)}, nil
	})
}

func (h *Handler) createCarePlan(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		key, err := httpx.RequireIdempotencyKey(r)
		if err != nil {
			return 0, nil, err
		}
		var body struct {
			FamilyID     string `json:"family_id"`
			Type         string `json:"type"`
			Title        string `json:"title"`
			Description  string `json:"description"`
			MedicationID string `json:"medication_id"`
			Rule         struct {
				Type      string `json:"type"`
				Interval  int    `json:"interval"`
				Days      []int  `json:"days"`
				Day       int    `json:"day"`
				Time      string `json:"time"`
				StartDate string `json:"start_date"`
				EndDate   string `json:"end_date"`
			} `json:"rule"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		frequency, timeOfDay, err := normalizeRule(body.Rule.Type, body.Rule.Interval, body.Rule.Days, body.Rule.Day, body.Rule.Time)
		if err != nil {
			return 0, nil, err
		}
		var endDate *time.Time
		var startDate *time.Time
		if body.Rule.StartDate != "" {
			d, e := parseCivilDate(body.Rule.StartDate)
			if e != nil {
				return 0, nil, httpx.ErrValidation("rule.start_date must be YYYY-MM-DD")
			}
			startDate = &d
		}
		if body.Rule.EndDate != "" {
			d, e := parseCivilDate(body.Rule.EndDate)
			if e != nil {
				return 0, nil, httpx.ErrValidation("rule.end_date must be YYYY-MM-DD")
			}
			endDate = &d
		}
		result, err := h.Svc.CreateCarePlanAtWithOptionsForFamilyAndMedication(r.Context(), r.PathValue("id"), auth(r).UserID, body.Type, body.Title, body.Description, body.MedicationID, frequency, h.Clock.Now(), startDate, endDate, timeOfDay, body.FamilyID, key)
		if err != nil {
			return 0, nil, err
		}
		out := map[string]any{"care_plan": carePlanDTO(result.Item), "care_rule": careRuleDTO(result.Rule)}
		if result.FirstTask != nil {
			out["task"] = taskDTO(*result.FirstTask)
		}
		return http.StatusCreated, out, nil
	})
}

// Dates from the API are civil dates, not UTC instants. Noon UTC keeps the
// value on the requested calendar day when the service later projects it into
// a supported Family timezone.
func parseCivilDate(value string) (time.Time, error) {
	d, err := time.Parse("2006-01-02", value)
	if err != nil {
		return time.Time{}, err
	}
	return time.Date(d.Year(), d.Month(), d.Day(), 12, 0, 0, 0, time.UTC), nil
}

func normalizeRule(kind string, interval int, days []int, day int, tod string) ([]byte, *time.Time, error) {
	if kind == "" {
		kind = "daily"
	}
	frequency := map[string]any{"v": 1, "kind": kind}
	switch kind {
	case "daily":
	case "weekly":
		frequency["days"] = days
	case "monthly":
		frequency["day"] = day
	case "interval":
		frequency["every_n"] = interval
	default:
		return nil, nil, httpx.ErrValidation("rule.type must be daily|weekly|monthly|interval")
	}
	raw, err := json.Marshal(frequency)
	if err != nil {
		return nil, nil, err
	}
	parsed, err := ParseSchedule(raw)
	if err != nil {
		return nil, nil, err
	}
	_ = parsed
	var timeOfDay *time.Time
	if tod != "" {
		t, e := parseTimeOfDay(tod)
		if e != nil {
			return nil, nil, e
		}
		timeOfDay = t
	}
	return raw, timeOfDay, nil
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		includeArchived, err := strconv.ParseBool(r.URL.Query().Get("include_archived"))
		if err != nil && r.URL.Query().Get("include_archived") != "" {
			return 0, nil, httpx.ErrValidation("include_archived must be true or false")
		}
		tasks, err := h.Svc.ListByPet(r.Context(), r.PathValue("id"), auth(r).UserID, includeArchived, r.URL.Query().Get("family_id"))
		if err != nil {
			return 0, nil, err
		}
		out := make([]map[string]any, len(tasks))
		for i, t := range tasks {
			out[i] = taskDTO(t)
		}
		key := "care_plans"
		if strings.Contains(r.URL.Path, "/tasks") {
			key = "tasks"
		}
		return http.StatusOK, map[string]any{key: out}, nil
	})
}

func (h *Handler) listAssignments(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		assignments, err := h.Svc.ListAssignments(r.Context(), r.PathValue("id"), auth(r).UserID, r.URL.Query().Get("family_id"))
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"assignments": assignments}, nil
	})
}

func (h *Handler) setAssignment(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		var body struct {
			Role string `json:"role"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		assignment, err := h.Svc.SetAssignment(r.Context(), r.PathValue("id"), auth(r).UserID, r.PathValue("user_id"), body.Role)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"assignment": assignment}, nil
	})
}

func (h *Handler) moveAssignment(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		key, err := httpx.RequireIdempotencyKey(r)
		if err != nil {
			return 0, nil, err
		}
		var body struct {
			Direction string `json:"direction"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		assignment, err := h.Svc.MoveAssignmentWithIdempotency(r.Context(), r.PathValue("id"), auth(r).UserID, r.PathValue("user_id"), body.Direction, key)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"assignment": assignment}, nil
	})
}

func (h *Handler) removeAssignment(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		if err := h.Svc.RemoveAssignment(r.Context(), r.PathValue("id"), auth(r).UserID, r.PathValue("user_id")); err != nil {
			return 0, nil, err
		}
		return http.StatusNoContent, nil, nil
	})
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		var body struct {
			Title       *string         `json:"title"`
			Description *string         `json:"description"`
			Schedule    json.RawMessage `json:"schedule"`
			TimeOfDay   json.RawMessage `json:"time_of_day"`
			Archived    *bool           `json:"archived"`
			Status      *string         `json:"status"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		if body.Status != nil {
			switch *body.Status {
			case "active", "paused", "archived":
			default:
				return 0, nil, httpx.ErrValidation("status must be active|paused|archived")
			}
			if body.Archived != nil {
				return 0, nil, httpx.ErrValidation("status and archived cannot be used together")
			}
		}
		// time_of_day 三态：缺省=不动 / null=清空 / "HH:MM"=设置。
		// 用 RawMessage 区分缺省与 null——*string 会把两者折叠成同一个 nil。
		var tod *time.Time
		todSet := len(body.TimeOfDay) > 0
		if todSet {
			var value *string
			if err := json.Unmarshal(body.TimeOfDay, &value); err != nil {
				return 0, nil, err
			}
			if value != nil {
				parsed, err := parseTimeOfDay(*value)
				if err != nil {
					return 0, nil, err
				}
				tod = parsed
			}
		}
		title := ""
		if body.Title != nil {
			title = *body.Title
		}
		description := ""
		if body.Description != nil {
			description = *body.Description
		}
		t, err := h.Svc.Update(r.Context(), r.PathValue("id"), auth(r).UserID,
			title, body.Title != nil, description, body.Description != nil, body.Schedule, tod, todSet, body.Archived, valueOrEmpty(body.Status), h.Clock.Now())
		if err != nil {
			return 0, nil, err
		}
		key := "care_plan"
		if strings.Contains(r.URL.Path, "/tasks/") {
			key = "task"
		}
		return http.StatusOK, map[string]any{key: taskDTO(t)}, nil
	})
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		if err := h.Svc.Delete(r.Context(), r.PathValue("id"), auth(r).UserID, h.Clock.Now()); err != nil {
			return 0, nil, err
		}
		return http.StatusNoContent, nil, nil
	})
}

func (h *Handler) today(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		date, groups, err := h.Svc.Today(r.Context(), r.PathValue("id"), auth(r).UserID,
			r.URL.Query().Get("date"), h.Clock.Now())
		if err != nil {
			return 0, nil, err
		}
		pets := make([]map[string]any, len(groups))
		for i, g := range groups {
			items := make([]map[string]any, len(g.Items))
			for j, it := range g.Items {
				task := taskDTO(it.Task)
				if it.AssignedToName != nil {
					task["assigned_to_name"] = *it.AssignedToName
				}
				item := map[string]any{"task": task}
				if it.CareRequest != nil {
					item["care_request"] = it.CareRequest
				}
				if it.Log != nil {
					l := logDTO(*it.Log)
					if it.DoneByName != nil {
						l["done_by_name"] = *it.DoneByName
					}
					item["log"] = l
				} else {
					item["log"] = nil
				}
				items[j] = item
			}
			pets[i] = map[string]any{"pet_id": g.PetID, "pet_name": g.PetName, "items": items}
		}
		return http.StatusOK, map[string]any{"date": date, "pets": pets}, nil
	})
}

// careRisks projects imminent care gaps back onto their original occurrence.
// The client can therefore take the existing Today action (complete, skip, or
// hand off) instead of creating a second task for the same care obligation.
func (h *Handler) careRisks(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		member, ok, err := h.Svc.Members.ActiveMember(r.Context(), r.PathValue("id"), auth(r).UserID)
		if err != nil {
			return 0, nil, err
		} else if !ok {
			return 0, nil, httpx.ErrNotFound("")
		}
		dateStr := r.URL.Query().Get("date")
		var risks []contracts.CareRisk
		if dateStr == "" {
			risks, err = h.Svc.UnassignedCareRisks(r.Context(), r.PathValue("id"), h.Clock.Now())
		} else {
			risks, err = h.Svc.UnassignedCareRisksForDate(r.Context(), r.PathValue("id"), dateStr, h.Clock.Now())
		}
		if err != nil {
			return 0, nil, err
		}
		out := make([]map[string]any, 0, len(risks))
		for _, risk := range risks {
			out = append(out, map[string]any{
				"occurrence_id":     risk.OccurrenceID,
				"request_id":        risk.RequestID,
				"pet_id":            risk.PetID,
				"pet_name":          risk.PetName,
				"title":             risk.Title,
				"due_at":            risk.DueAt,
				"family_timezone":   risk.FamilyTimezone,
				"waiting_on_user":   risk.WaitingOnUser,
				"escalation_failed": risk.EscalationFailed,
				"can_claim":         risk.RequestID == "" && member.Role != contracts.RoleViewer && member.Role != contracts.RoleReadOnly,
			})
		}
		return http.StatusOK, map[string]any{"risks": out}, nil
	})
}

func (h *Handler) todayFilter(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		familyID := r.URL.Query().Get("family_id")
		petID := r.URL.Query().Get("pet_id")
		var date string
		var groups []TodayPetGroup
		var err error
		if familyID != "" && petID != "" {
			date, groups, err = h.Svc.TodayForPetInFamily(r.Context(), familyID, petID, auth(r).UserID, r.URL.Query().Get("date"), h.Clock.Now())
		} else if familyID != "" {
			date, groups, err = h.Svc.Today(r.Context(), familyID, auth(r).UserID, r.URL.Query().Get("date"), h.Clock.Now())
		} else if petID != "" {
			date, groups, err = h.Svc.TodayForPet(r.Context(), petID, auth(r).UserID, r.URL.Query().Get("date"), h.Clock.Now())
		} else {
			date, groups, err = h.Svc.TodayAll(r.Context(), auth(r).UserID, r.URL.Query().Get("date"), h.Clock.Now())
		}
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, todayDTO(date, groups), nil
	})
}

// GET /api/v1/care-stats?from=&to=&family_id=|pet_id=
// 区间照护执行统计:分母含 missed,完成率是服务端事实而非前端拼凑。
func (h *Handler) careStats(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		q := r.URL.Query()
		from := q.Get("from")
		to := q.Get("to")
		if from == "" || to == "" {
			return 0, nil, httpx.ErrValidation("from and to are required (YYYY-MM-DD)")
		}
		out, err := h.Svc.CareStats(r.Context(), auth(r).UserID,
			CareStatsScope{FamilyID: q.Get("family_id"), PetID: q.Get("pet_id")},
			from, to, h.Clock.Now())
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, out, nil
	})
}

func todayDTO(date string, groups []TodayPetGroup) map[string]any {
	pets := make([]map[string]any, len(groups))
	for i, g := range groups {
		items := make([]map[string]any, len(g.Items))
		for j, it := range g.Items {
			task := taskDTO(it.Task)
			if it.AssignedToName != nil {
				task["assigned_to_name"] = *it.AssignedToName
			}
			item := map[string]any{"task": task}
			if it.CareRequest != nil {
				item["care_request"] = it.CareRequest
			}
			if it.Log != nil {
				l := logDTO(*it.Log)
				if it.DoneByName != nil {
					l["done_by_name"] = *it.DoneByName
				}
				item["log"] = l
			} else {
				item["log"] = nil
			}
			items[j] = item
		}
		pets[i] = map[string]any{"pet_id": g.PetID, "pet_name": g.PetName, "items": items}
	}
	return map[string]any{"date": date, "pets": pets}
}

func (h *Handler) scheduleActions(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		key, err := httpx.RequireIdempotencyKey(r)
		if err != nil {
			return 0, nil, err
		}
		var body ScheduleActionRequest
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		result, err := h.Svc.ApplyScheduleAction(r.Context(), auth(r).UserID, body, h.Clock.Now(), key)
		if err != nil {
			return 0, nil, err
		}
		out := map[string]any{}
		if result.Override != nil {
			out["override"] = result.Override
		}
		if result.Task != nil {
			out["task"] = taskDTO(*result.Task)
		}
		if result.Rule != nil {
			out["care_rule"] = careRuleDTO(*result.Rule)
		}
		return http.StatusOK, out, nil
	})
}

func (h *Handler) complete(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		key, err := httpx.RequireIdempotencyKey(r)
		if err != nil {
			return 0, nil, err
		}
		var body struct {
			Status string `json:"status"`
			Date   string `json:"date"`
			Note   string `json:"note"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		if body.Status == "" {
			body.Status = "done"
		}
		logEntry, err := h.Svc.CompleteTaskWithIdempotency(r.Context(), r.PathValue("id"), auth(r).UserID,
			body.Status, body.Date, body.Note, h.Clock.Now(), key)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusCreated, map[string]any{"log": logDTO(logEntry)}, nil
	})
}

func (h *Handler) undo(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		key, err := httpx.RequireIdempotencyKey(r)
		if err != nil {
			return 0, nil, err
		}
		if err := h.Svc.UndoWithIdempotency(r.Context(), r.PathValue("id"), auth(r).UserID, key); err != nil {
			return 0, nil, err
		}
		return http.StatusNoContent, nil, nil
	})
}

func taskDTO(t Task) map[string]any {
	m := map[string]any{
		"id": t.ID, "pet_id": t.PetID, "care_plan_id": t.CarePlanID, "care_rule_id": t.CareRuleID,
		"type": t.Type, "title": t.Title, "description": t.Description, "schedule": json.RawMessage(orEmpty(t.Schedule)), "timezone": t.Timezone,
		"created_by_user_id": t.CreatedByUserID, "created_at": t.CreatedAt,
	}
	if t.FamilyID != "" {
		m["family_id"] = t.FamilyID
	}
	if t.TimeOfDay != nil {
		m["time_of_day"] = t.TimeOfDay.Format("15:04")
	}
	if t.ArchivedAt != nil {
		m["archived_at"] = t.ArchivedAt
	}
	if t.DueAt != nil {
		m["due_at"] = t.DueAt
	}
	if t.DueDate != nil {
		m["due_date"] = t.DueDate.Format("2006-01-02")
	}
	if t.Status != "" {
		m["status"] = t.Status
	}
	if t.AssignedTo != nil {
		m["assigned_to_user_id"] = *t.AssignedTo
	}
	if t.CompletedBy != nil {
		m["completed_by_user_id"] = *t.CompletedBy
	}
	if t.CompletedAt != nil {
		m["completed_at"] = t.CompletedAt
	}
	return m
}

func carePlanDTO(item CarePlan) map[string]any {
	m := map[string]any{
		"id": item.ID, "pet_id": item.PetID, "type": item.Type, "title": item.Title,
		"description": item.Description, "status": item.Status,
		"frequency":  json.RawMessage(orEmpty(item.Frequency)),
		"schedule":   json.RawMessage(orEmpty(item.Frequency)),
		"start_date": item.StartDate.Format("2006-01-02"), "timezone": item.Timezone,
		"created_by_user_id": item.CreatedByUserID, "created_at": item.CreatedAt, "updated_at": item.UpdatedAt,
	}
	if item.EndDate != nil {
		m["end_date"] = item.EndDate.Format("2006-01-02")
	}
	if item.FamilyID != "" {
		m["family_id"] = item.FamilyID
	}
	if item.TimeOfDay != nil {
		m["time_of_day"] = item.TimeOfDay.Format("15:04")
	}
	return m
}

func careRuleDTO(rule CareRule) map[string]any {
	m := map[string]any{"id": rule.ID, "care_plan_id": rule.CarePlanID, "frequency": json.RawMessage(orEmpty(rule.Frequency)), "start_date": rule.StartDate.Format("2006-01-02"), "timezone": rule.Timezone, "created_at": rule.CreatedAt, "updated_at": rule.UpdatedAt}
	if rule.EndDate != nil {
		m["end_date"] = rule.EndDate.Format("2006-01-02")
	}
	if rule.TimeOfDay != nil {
		m["time_of_day"] = rule.TimeOfDay.Format("15:04")
	}
	return m
}

func orEmpty(b []byte) string {
	if len(b) == 0 {
		return "{}"
	}
	return string(b)
}
