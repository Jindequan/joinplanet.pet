package meds

import (
	"net/http"
	"time"

	"github.com/joinplanet/planet-api/internal/contracts"
	"github.com/joinplanet/planet-api/internal/platform/httpx"
)

type Handler struct{ Svc *Service }

func (h *Handler) Mount(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/v1/pets/{id}/medications", h.create)
	mux.HandleFunc("GET /api/v1/pets/{id}/medications", h.list)
	mux.HandleFunc("PATCH /api/v1/medications/{id}", h.update)
	mux.HandleFunc("POST /api/v1/medications/{id}/stop", h.stop)
	mux.HandleFunc("DELETE /api/v1/medications/{id}", h.delete)
}

func auth(r *http.Request) contracts.Auth {
	a, _ := contracts.AuthFrom(r.Context())
	return a
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		key, err := httpx.RequireIdempotencyKey(r)
		if err != nil {
			return 0, nil, err
		}
		var body struct {
			Name     string `json:"name"`
			Dose     string `json:"dose"`
			Schedule string `json:"schedule"`
			Note     string `json:"note"`
			FamilyID string `json:"family_id"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		med, err := h.Svc.CreateWithIdempotencyForFamily(r.Context(), r.PathValue("id"), auth(r).UserID,
			body.Name, body.Dose, body.Schedule, body.Note, body.FamilyID, key)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusCreated, map[string]any{"medication": medDTO(med)}, nil
	})
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		meds, err := h.Svc.List(r.Context(), r.PathValue("id"), auth(r).UserID)
		if err != nil {
			return 0, nil, err
		}
		out := make([]map[string]any, len(meds))
		for i, m := range meds {
			out[i] = medDTO(m)
		}
		return http.StatusOK, map[string]any{"medications": out}, nil
	})
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		var body struct {
			Name     *string `json:"name"`
			Dose     *string `json:"dose"`
			Schedule *string `json:"schedule"`
			Note     *string `json:"note"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		med, err := h.Svc.Update(r.Context(), r.PathValue("id"), auth(r).UserID,
			body.Name, body.Dose, body.Schedule, body.Note)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"medication": medDTO(med)}, nil
	})
}

func (h *Handler) stop(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		key, err := httpx.RequireIdempotencyKey(r)
		if err != nil {
			return 0, nil, err
		}
		var body struct {
			EndedOn  string `json:"ended_on"` // 可选 YYYY-MM-DD
			FamilyID string `json:"family_id"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		var endedOn *time.Time
		if body.EndedOn != "" {
			t, err := time.Parse("2006-01-02", body.EndedOn)
			if err != nil {
				return 0, nil, httpx.ErrValidation("ended_on must be YYYY-MM-DD")
			}
			endedOn = &t
		}
		med, err := h.Svc.StopForFamilyWithIdempotency(r.Context(), r.PathValue("id"), auth(r).UserID, endedOn, body.FamilyID, key)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"medication": medDTO(med)}, nil
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

func medDTO(m Medication) map[string]any {
	out := map[string]any{
		"id": m.ID, "pet_id": m.PetID, "name": m.Name,
		"dose": m.Dose, "schedule": m.Schedule,
		"started_on": m.StartedOn.Format("2006-01-02"),
		"note":       m.Note, "created_by_user_id": m.CreatedByUserID,
		"created_at": m.CreatedAt, "updated_at": m.UpdatedAt,
	}
	if m.EndedOn != nil {
		out["ended_on"] = m.EndedOn.Format("2006-01-02")
	}
	return out
}
