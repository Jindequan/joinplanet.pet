package handoffs

import (
	"net/http"

	"github.com/joinplanet/planet-api/internal/contracts"
	"github.com/joinplanet/planet-api/internal/platform/httpx"
)

type Handler struct{ Svc *Service }

func (h *Handler) Mount(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/pets/{id}/handoff", h.get)
	mux.HandleFunc("POST /api/v1/pets/{id}/handoff", h.claim)
	mux.HandleFunc("POST /api/v1/pets/{id}/handoff/release", h.release)
	mux.HandleFunc("GET /api/v1/families/{id}/handoff-summary", h.summary)
	mux.HandleFunc("GET /api/v1/families/{id}/care-responsibility", h.responsibility)
}

func auth(r *http.Request) contracts.Auth {
	a, _ := contracts.AuthFrom(r.Context())
	return a
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		active, err := h.Svc.GetActive(r.Context(), r.PathValue("id"), auth(r).UserID)
		if err != nil {
			return 0, nil, err
		}
		if active == nil {
			return http.StatusOK, map[string]any{"handoff": nil}, nil
		}
		return http.StatusOK, map[string]any{"handoff": handoffDTO(*active, auth(r).UserID)}, nil
	})
}

func (h *Handler) claim(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		key, err := httpx.RequireIdempotencyKey(r)
		if err != nil {
			return 0, nil, err
		}
		var body struct {
			Note string `json:"note"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		handoff, err := h.Svc.ClaimWithIdempotency(r.Context(), r.PathValue("id"), auth(r).UserID, body.Note, key)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"handoff": handoffDTO(handoff, auth(r).UserID)}, nil
	})
}

func (h *Handler) release(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		key, err := httpx.RequireIdempotencyKey(r)
		if err != nil {
			return 0, nil, err
		}
		var body struct {
			Note string `json:"note"`
		}
		_ = httpx.DecodeJSON(r, &body)
		if err := h.Svc.ReleaseWithIdempotency(r.Context(), r.PathValue("id"), auth(r).UserID, body.Note, key); err != nil {
			return 0, nil, err
		}
		return http.StatusNoContent, nil, nil
	})
}

func (h *Handler) summary(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		list, err := h.Svc.FamilySummary(r.Context(), r.PathValue("id"), auth(r).UserID)
		if err != nil {
			return 0, nil, err
		}
		pets := make([]map[string]any, len(list))
		for i, item := range list {
			row := map[string]any{
				"pet_id":        item.PetID,
				"pet_name":      item.PetName,
				"pending_today": item.PendingToday,
			}
			if item.Handoff != nil {
				row["handoff"] = handoffDTO(*item.Handoff, auth(r).UserID)
			} else {
				row["handoff"] = nil
			}
			pets[i] = row
		}
		return http.StatusOK, map[string]any{"pets": pets}, nil
	})
}

func (h *Handler) responsibility(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		familyID := r.PathValue("id")
		viewerID := auth(r).UserID
		list, err := h.Svc.FamilySummary(r.Context(), familyID, viewerID)
		if err != nil {
			return 0, nil, err
		}

		filterPetID := r.URL.Query().Get("pet_id")
		pets := make([]map[string]any, 0, len(list))
		bannerVisible := false
		for _, item := range list {
			// Filtering after FamilySummary keeps the endpoint from exposing a
			// pet that is not currently in this family.
			if filterPetID != "" && item.PetID != filterPetID {
				continue
			}

			isMe := item.Handoff != nil && item.Handoff.UserID == viewerID
			showRelease := item.Handoff != nil && isMe
			showClaim := item.Handoff == nil || !isMe
			if showRelease || (item.PendingToday > 0 && item.Handoff == nil) || (item.Handoff != nil && !isMe) {
				bannerVisible = true
			}

			row := map[string]any{
				"pet_id":        item.PetID,
				"pet_name":      item.PetName,
				"pending_today": item.PendingToday,
				"on_duty":       nil,
				"show_claim":    showClaim,
				"show_release":  showRelease,
			}
			if item.Handoff != nil {
				row["on_duty"] = handoffDTO(*item.Handoff, viewerID)
			}
			pets = append(pets, row)
		}

		return http.StatusOK, map[string]any{
			"family_id":      familyID,
			"pets":           pets,
			"banner_visible": bannerVisible,
		}, nil
	})
}
