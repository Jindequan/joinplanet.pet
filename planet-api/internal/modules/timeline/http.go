package timeline

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/joinplanet/planet-api/internal/contracts"
	"github.com/joinplanet/planet-api/internal/platform/httpx"
)

type Handler struct{ Svc *Service }

func (h *Handler) Mount(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/pets/{id}/timeline", h.list)
	mux.HandleFunc("GET /api/v1/timeline", h.aggregate)
	mux.HandleFunc("POST /api/v1/pets/{id}/timeline", h.create)
	mux.HandleFunc("PATCH /api/v1/timeline-events/{id}", h.update)
	mux.HandleFunc("DELETE /api/v1/timeline-events/{id}", h.delete)
}

func (h *Handler) aggregate(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		before, beforeID, err := parseCursor(r)
		if err != nil {
			return 0, nil, err
		}
		familyID := r.URL.Query().Get("family_id")
		petID := r.URL.Query().Get("pet_id")
		if familyID != "" && petID != "" {
			return 0, nil, httpx.ErrValidation("family_id and pet_id cannot be combined")
		}
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		events, last, err := h.Svc.ListAggregate(r.Context(), auth(r).UserID, familyID, petID, before, beforeID, limit)
		if err != nil {
			return 0, nil, err
		}
		out := make([]map[string]any, len(events))
		for i, event := range events {
			out[i] = eventDTO(event)
		}
		result := map[string]any{"events": out}
		if last != nil && len(events) == limitValue(limit) {
			result["next_cursor"] = map[string]any{"before": last.OccurredAt, "before_id": last.ID}
		}
		return http.StatusOK, result, nil
	})
}

func parseCursor(r *http.Request) (*time.Time, *string, error) {
	var before *time.Time
	var beforeID *string
	if raw := r.URL.Query().Get("before"); raw != "" {
		t, err := time.Parse(time.RFC3339, raw)
		if err != nil {
			return nil, nil, httpx.ErrValidation("before must be RFC3339")
		}
		before = &t
	}
	if raw := r.URL.Query().Get("before_id"); raw != "" {
		if !validUUID(raw) {
			return nil, nil, httpx.ErrValidation("before_id must be a UUID")
		}
		beforeID = &raw
	}
	if beforeID != nil && before == nil {
		return nil, nil, httpx.ErrValidation("before_id requires before")
	}
	return before, beforeID, nil
}

func limitValue(limit int) int {
	if limit <= 0 || limit > 200 {
		return 100
	}
	return limit
}

func auth(r *http.Request) contracts.Auth {
	a, _ := contracts.AuthFrom(r.Context())
	return a
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		var before *time.Time
		var beforeID *string
		if raw := r.URL.Query().Get("before"); raw != "" {
			t, err := time.Parse(time.RFC3339, raw)
			if err != nil {
				return 0, nil, httpx.ErrValidation("before must be RFC3339")
			}
			before = &t
		}
		if raw := r.URL.Query().Get("before_id"); raw != "" {
			if !validUUID(raw) {
				return 0, nil, httpx.ErrValidation("before_id must be a UUID")
			}
			beforeID = &raw
		}
		if beforeID != nil && before == nil {
			return 0, nil, httpx.ErrValidation("before_id requires before")
		}
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		events, err := h.Svc.List(r.Context(), r.PathValue("id"), auth(r).UserID, before, beforeID, limit)
		if err != nil {
			return 0, nil, err
		}
		out := make([]map[string]any, len(events))
		for i, e := range events {
			out[i] = eventDTO(e)
		}
		result := map[string]any{"events": out}
		if len(events) == limitValue(limit) && len(events) > 0 {
			last := events[len(events)-1]
			result["next_cursor"] = map[string]any{"before": last.OccurredAt, "before_id": last.ID}
		}
		return http.StatusOK, result, nil
	})
}

func validUUID(raw string) bool {
	if len(raw) != 36 || raw[8] != '-' || raw[13] != '-' || raw[18] != '-' || raw[23] != '-' {
		return false
	}
	for i, r := range raw {
		if i == 8 || i == 13 || i == 18 || i == 23 {
			continue
		}
		if !((r >= '0' && r <= '9') || (r >= 'a' && r <= 'f') || (r >= 'A' && r <= 'F')) {
			return false
		}
	}
	return true
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		key, err := httpx.RequireIdempotencyKey(r)
		if err != nil {
			return 0, nil, err
		}
		var body struct {
			FamilyID   string          `json:"family_id"`
			Type       string          `json:"type"`
			OccurredAt string          `json:"occurred_at"`
			Payload    json.RawMessage `json:"payload"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		if AutoTypes[body.Type] {
			// auto 类型仅由系统生成（medication/transfer；语义分界 D6/D10）
			return 0, nil, httpx.ErrValidation("type " + body.Type + " is auto-generated only")
		}
		occ, err := time.Parse(time.RFC3339, body.OccurredAt)
		if err != nil {
			return 0, nil, httpx.ErrValidation("occurred_at must be RFC3339")
		}
		e, err := h.Svc.CreateWithFamilyAndIdempotency(r.Context(), r.PathValue("id"), auth(r).UserID, body.FamilyID, body.Type, occ, body.Payload, key)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusCreated, map[string]any{"event": eventDTO(e)}, nil
	})
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		var body struct {
			OccurredAt string          `json:"occurred_at"`
			Payload    json.RawMessage `json:"payload"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		occ, err := time.Parse(time.RFC3339, body.OccurredAt)
		if err != nil {
			return 0, nil, httpx.ErrValidation("occurred_at must be RFC3339")
		}
		e, err := h.Svc.Update(r.Context(), r.PathValue("id"), auth(r).UserID, occ, body.Payload)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"event": eventDTO(e)}, nil
	})
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		if err := h.Svc.Delete(r.Context(), r.PathValue("id"), auth(r).UserID); err != nil {
			return 0, nil, err
		}
		return http.StatusNoContent, nil, nil
	})
}

func eventDTO(e Event) map[string]any {
	payload := json.RawMessage("{}")
	if len(e.Payload) > 0 {
		payload = json.RawMessage(e.Payload)
	}
	m := map[string]any{
		"id": e.ID, "pet_id": e.PetID, "type": e.Type,
		"occurred_at": e.OccurredAt, "recorded_by": e.RecordedBy,
		"recorded_at": e.RecordedAt, "payload": payload,
		"payload_version": e.PayloadVersion, "source": e.Source,
	}
	if e.FamilyID != "" {
		m["family_id"] = e.FamilyID
	}
	if e.CareOccurrenceID != "" {
		m["care_occurrence_id"] = e.CareOccurrenceID
	}
	if e.RecordedByName != "" {
		m["recorded_by_name"] = e.RecordedByName
	}
	if e.EditedAt != nil {
		m["edited_at"] = e.EditedAt
	}
	return m
}
