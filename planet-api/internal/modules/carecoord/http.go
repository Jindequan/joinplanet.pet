package carecoord

import (
	"net/http"
	"strings"
	"time"

	"github.com/joinplanet/planet-api/internal/contracts"
	"github.com/joinplanet/planet-api/internal/platform/httpx"
)

type Handler struct{ Svc *Service }

func (h *Handler) Mount(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/v1/care-occurrences/{id}/requests", h.create)
	mux.HandleFunc("POST /api/v1/families/{family_id}/care-handoff-batches", h.createBatch)
	mux.HandleFunc("POST /api/v1/families/{family_id}/care-occurrences/{id}/claim", h.claim)
	mux.HandleFunc("GET /api/v1/care-requests/inbox", h.inbox)
	mux.HandleFunc("GET /api/v1/care-requests/sent", h.sent)
	mux.HandleFunc("GET /api/v1/care-handoff-batches/inbox", h.batchInbox)
	mux.HandleFunc("GET /api/v1/care-handoff-batches/{id}", h.getBatch)
	mux.HandleFunc("POST /api/v1/care-handoff-batches/{id}/accept", h.acceptBatch)
	mux.HandleFunc("POST /api/v1/care-handoff-batches/{id}/decline", h.declineBatch)
	mux.HandleFunc("POST /api/v1/care-handoff-batches/{id}/delegate", h.delegateBatch)
	mux.HandleFunc("POST /api/v1/care-handoff-batches/{id}/reassign", h.reassignBatch)
	mux.HandleFunc("GET /api/v1/care-requests/{id}", h.get)
	mux.HandleFunc("GET /api/v1/care-requests/{id}/chain", h.chain)
	mux.HandleFunc("POST /api/v1/care-requests/{id}/seen", h.seen)
	mux.HandleFunc("POST /api/v1/care-requests/{id}/accept", h.accept)
	mux.HandleFunc("POST /api/v1/care-requests/{id}/decline", h.decline)
	mux.HandleFunc("POST /api/v1/care-requests/{id}/delegate", h.delegate)
	mux.HandleFunc("POST /api/v1/care-requests/{id}/reassign", h.reassign)
}

func (h *Handler) claim(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		key, err := httpx.RequireIdempotencyKey(r)
		if err != nil {
			return 0, nil, err
		}
		result, err := h.Svc.Claim(r.Context(), auth(r).UserID, r.PathValue("family_id"), r.PathValue("id"), key)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"claim": result}, nil
	})
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
			FamilyID     string `json:"family_id"`
			TargetUserID string `json:"target_user_id"`
			Message      string `json:"message"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		item, err := h.Svc.Create(r.Context(), auth(r).UserID, body.FamilyID, r.PathValue("id"), body.TargetUserID, body.Message, key)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusCreated, map[string]any{"care_request": item}, nil
	})
}

func parseBatchTime(value string) (*time.Time, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, nil
	}
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return nil, httpx.ErrValidation("starts_at and ends_at must be RFC3339 timestamps")
	}
	return &parsed, nil
}

func (h *Handler) createBatch(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		key, err := httpx.RequireIdempotencyKey(r)
		if err != nil {
			return 0, nil, err
		}
		var body struct {
			TargetUserID  string   `json:"target_user_id"`
			OccurrenceIDs []string `json:"occurrence_ids"`
			Message       string   `json:"message"`
			StartsAt      string   `json:"starts_at"`
			EndsAt        string   `json:"ends_at"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		startsAt, err := parseBatchTime(body.StartsAt)
		if err != nil {
			return 0, nil, err
		}
		endsAt, err := parseBatchTime(body.EndsAt)
		if err != nil {
			return 0, nil, err
		}
		if startsAt != nil && endsAt != nil && !endsAt.After(*startsAt) {
			return 0, nil, httpx.ErrValidation("ends_at must be after starts_at")
		}
		batch, err := h.Svc.CreateBatch(r.Context(), auth(r).UserID, r.PathValue("family_id"), body.TargetUserID, body.OccurrenceIDs, body.Message, startsAt, endsAt, key)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusCreated, map[string]any{"batch": batch}, nil
	})
}

func (h *Handler) inbox(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		items, err := h.Svc.Inbox(r.Context(), auth(r).UserID)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"care_requests": items}, nil
	})
}

func (h *Handler) sent(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		items, err := h.Svc.Sent(r.Context(), auth(r).UserID)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"care_requests": items}, nil
	})
}

func (h *Handler) batchInbox(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		items, err := h.Svc.InboxBatches(r.Context(), auth(r).UserID)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"batches": items}, nil
	})
}

func (h *Handler) getBatch(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		item, err := h.Svc.GetBatch(r.Context(), auth(r).UserID, r.PathValue("id"))
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"batch": item}, nil
	})
}

func (h *Handler) acceptBatch(w http.ResponseWriter, r *http.Request) {
	h.respondBatch(w, r, "accepted")
}

func (h *Handler) declineBatch(w http.ResponseWriter, r *http.Request) {
	h.respondBatch(w, r, "declined")
}

func (h *Handler) delegateBatch(w http.ResponseWriter, r *http.Request) {
	h.continueBatch(w, r, false)
}

func (h *Handler) reassignBatch(w http.ResponseWriter, r *http.Request) {
	h.continueBatch(w, r, true)
}

func (h *Handler) continueBatch(w http.ResponseWriter, r *http.Request, reassign bool) {
	httpx.Handle(w, r, func() (int, any, error) {
		key, err := httpx.RequireIdempotencyKey(r)
		if err != nil {
			return 0, nil, err
		}
		var body struct {
			TargetUserID  string   `json:"target_user_id"`
			OccurrenceIDs []string `json:"occurrence_ids"`
			Message       string   `json:"message"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		var result BatchDelegationResponse
		if reassign {
			result, err = h.Svc.ReassignBatch(r.Context(), auth(r).UserID, r.PathValue("id"), body.TargetUserID, body.Message, body.OccurrenceIDs, key)
		} else {
			result, err = h.Svc.DelegateBatch(r.Context(), auth(r).UserID, r.PathValue("id"), body.TargetUserID, body.Message, body.OccurrenceIDs, key)
		}
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, result, nil
	})
}

func (h *Handler) respondBatch(w http.ResponseWriter, r *http.Request, action string) {
	httpx.Handle(w, r, func() (int, any, error) {
		key, err := httpx.RequireIdempotencyKey(r)
		if err != nil {
			return 0, nil, err
		}
		var body struct {
			OccurrenceIDs []string `json:"occurrence_ids"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		result, err := h.Svc.RespondBatch(r.Context(), auth(r).UserID, r.PathValue("id"), action, body.OccurrenceIDs, key)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, result, nil
	})
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		item, err := h.Svc.Get(r.Context(), auth(r).UserID, r.PathValue("id"))
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"care_request": item}, nil
	})
}

func (h *Handler) chain(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		items, err := h.Svc.Chain(r.Context(), auth(r).UserID, r.PathValue("id"))
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"care_requests": items}, nil
	})
}

func (h *Handler) seen(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		item, err := h.Svc.MarkSeen(r.Context(), auth(r).UserID, r.PathValue("id"))
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"care_request": item}, nil
	})
}

func (h *Handler) accept(w http.ResponseWriter, r *http.Request) {
	h.respond(w, r, true)
}

func (h *Handler) decline(w http.ResponseWriter, r *http.Request) {
	h.respond(w, r, false)
}

func (h *Handler) respond(w http.ResponseWriter, r *http.Request, accept bool) {
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
		var item Request
		if accept {
			item, err = h.Svc.Accept(r.Context(), auth(r).UserID, r.PathValue("id"), body.Note, key)
		} else {
			item, err = h.Svc.Decline(r.Context(), auth(r).UserID, r.PathValue("id"), body.Note, key)
		}
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"care_request": item}, nil
	})
}

func (h *Handler) delegate(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		key, err := httpx.RequireIdempotencyKey(r)
		if err != nil {
			return 0, nil, err
		}
		var body struct {
			TargetUserID string `json:"target_user_id"`
			Message      string `json:"message"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		item, err := h.Svc.Delegate(r.Context(), auth(r).UserID, r.PathValue("id"), body.TargetUserID, body.Message, key)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusCreated, map[string]any{"care_request": item}, nil
	})
}

func (h *Handler) reassign(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		key, err := httpx.RequireIdempotencyKey(r)
		if err != nil {
			return 0, nil, err
		}
		var body struct {
			TargetUserID string `json:"target_user_id"`
			Message      string `json:"message"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		item, err := h.Svc.Reassign(r.Context(), auth(r).UserID, r.PathValue("id"), body.TargetUserID, body.Message, key)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusCreated, map[string]any{"care_request": item}, nil
	})
}
