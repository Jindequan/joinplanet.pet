package transfers

import (
	"net/http"

	"github.com/joinplanet/planet-api/internal/contracts"
	"github.com/joinplanet/planet-api/internal/platform/httpx"
)

type Handler struct{ Svc *Service }

func (h *Handler) Mount(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/v1/pets/{id}/transfer", h.create)
	mux.HandleFunc("GET /api/v1/families/{id}/transfers", h.list)
	mux.HandleFunc("POST /api/v1/transfers/{id}/accept", h.accept)
	mux.HandleFunc("POST /api/v1/transfers/{id}/decline", h.decline)
	mux.HandleFunc("DELETE /api/v1/transfers/{id}", h.cancel)
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
			FromFamilyID string `json:"from_family_id"`
			ToFamilyID   string `json:"to_family_id"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		t, err := h.Svc.Create(r.Context(), r.PathValue("id"), auth(r).UserID, body.ToFamilyID, body.FromFamilyID, key)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusCreated, map[string]any{"transfer": transferDTO(t)}, nil
	})
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		direction := r.URL.Query().Get("direction") // incoming（默认）| outgoing
		list, err := h.Svc.List(r.Context(), r.PathValue("id"), auth(r).UserID, direction)
		if err != nil {
			return 0, nil, err
		}
		out := make([]map[string]any, len(list))
		for i, t := range list {
			out[i] = transferDTO(t)
		}
		return http.StatusOK, map[string]any{"transfers": out}, nil
	})
}

func (h *Handler) accept(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		key, err := httpx.RequireIdempotencyKey(r)
		if err != nil {
			return 0, nil, err
		}
		t, err := h.Svc.Accept(r.Context(), r.PathValue("id"), auth(r).UserID, key)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"transfer": transferDTO(t)}, nil
	})
}

func (h *Handler) decline(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		key, err := httpx.RequireIdempotencyKey(r)
		if err != nil {
			return 0, nil, err
		}
		t, err := h.Svc.DeclineWithIdempotency(r.Context(), r.PathValue("id"), auth(r).UserID, key)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"transfer": transferDTO(t)}, nil
	})
}

func (h *Handler) cancel(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		// DELETE remains compatible with older clients that predate mutation
		// idempotency headers. The state transition itself is atomic and a
		// repeated cancel is rejected as not-pending; new clients still send it.
		key := r.Header.Get("Idempotency-Key")
		if err := h.Svc.CancelWithIdempotency(r.Context(), r.PathValue("id"), auth(r).UserID, key); err != nil {
			return 0, nil, err
		}
		return http.StatusNoContent, nil, nil
	})
}

func transferDTO(t Transfer) map[string]any {
	m := map[string]any{
		"id": t.ID, "pet_id": t.PetID, "pet_name": t.PetName,
		"pet_archived":   t.PetArchived,
		"from_family_id": t.FromFamilyID, "to_family_id": t.ToFamilyID,
		"status": t.Status, "created_by_user_id": t.CreatedByUserID, "created_at": t.CreatedAt,
	}
	if t.DecidedByUserID != nil {
		m["decided_by_user_id"] = *t.DecidedByUserID
	}
	if t.DecidedAt != nil {
		m["decided_at"] = t.DecidedAt
	}
	return m
}
