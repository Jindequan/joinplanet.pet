package sharing

import (
	"encoding/json"
	"net/http"

	"github.com/joinplanet/planet-api/internal/contracts"
	"github.com/joinplanet/planet-api/internal/platform/httpx"
)

type Handler struct {
	Svc *Service
	// ViewPerMinute：匿名查看限流（按 IP），app 注入。
	ViewPerMinute *httpx.Limiter
}

func (h *Handler) Mount(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/v1/pets/{id}/shares", h.create)
	mux.HandleFunc("GET /api/v1/pets/{id}/shares", h.list)
	mux.HandleFunc("DELETE /api/v1/shares/{id}", h.revoke)
	// 公开（匿名）查看：app 的 authz 对 /api/v1/shares/ 前缀直通
	mux.HandleFunc("GET /api/v1/shares/{token}", h.view)
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
			Kind     string          `json:"kind"`
			TTLHours int             `json:"ttl_hours"`
			Options  json.RawMessage `json:"options"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		share, token, err := h.Svc.CreateWithIdempotency(r.Context(), r.PathValue("id"), auth(r).UserID,
			body.Kind, body.TTLHours, body.Options, key)
		if err != nil {
			return 0, nil, err
		}
		// token 明文仅此一次返回；列表接口永不回显
		return http.StatusCreated, map[string]any{
			"share": shareDTO(share),
			"token": token,
		}, nil
	})
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		shares, err := h.Svc.List(r.Context(), r.PathValue("id"), auth(r).UserID)
		if err != nil {
			return 0, nil, err
		}
		out := make([]map[string]any, len(shares))
		for i, s := range shares {
			out[i] = shareDTO(s)
		}
		return http.StatusOK, map[string]any{"shares": out}, nil
	})
}

func (h *Handler) revoke(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		if err := h.Svc.Revoke(r.Context(), r.PathValue("id"), auth(r).UserID); err != nil {
			return 0, nil, err
		}
		return http.StatusNoContent, nil, nil
	})
}

func (h *Handler) view(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		if h.ViewPerMinute != nil && !h.ViewPerMinute.Allow("share:"+httpx.ClientIP(r)) {
			return 0, nil, httpx.NewAppError(http.StatusTooManyRequests, "SHARE_RATE_LIMITED", "too many requests")
		}
		result, err := h.Svc.ViewByToken(r.Context(), r.PathValue("token"))
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, result, nil
	})
}

func shareDTO(s ShareLink) map[string]any {
	return map[string]any{
		"id": s.ID, "pet_id": s.PetID, "kind": s.Kind,
		"expires_at": s.ExpiresAt, "revoked_at": s.RevokedAt,
		"view_count": s.ViewCount, "last_viewed_at": s.LastViewedAt,
		"created_at": s.CreatedAt,
	}
}
