package digest

import (
	"net/http"

	"github.com/joinplanet/planet-api/internal/contracts"
	"github.com/joinplanet/planet-api/internal/platform/clockx"
	"github.com/joinplanet/planet-api/internal/platform/httpx"
)

type Handler struct {
	Svc   *Service
	Clock clockx.Clock
}

func (h *Handler) Mount(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/families/{id}/digest", h.get)
	mux.HandleFunc("POST /api/v1/families/{id}/digest/send", h.send)
}

func auth(r *http.Request) contracts.Auth {
	a, _ := contracts.AuthFrom(r.Context())
	return a
}

// get：?date=YYYY-MM-DD（缺省 = 圈时区今天）。
func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		view, err := h.Svc.View(r.Context(), r.PathValue("id"), auth(r).UserID,
			r.URL.Query().Get("date"), h.Clock.Now())
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, view, nil
	})
}

// send：{date?}（缺省 = 圈时区今天）；逐收件人容错，返回 {sent, skipped, failures}。
// 群发邮件是高影响动作：仅 owner 可手动触发，且与调度器共用 (family, date)
// 持久去重——同一天第二次调用返回 skipped，不重复投递。
func (h *Handler) send(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		var body struct {
			Date string `json:"date"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		m, ok, err := h.Svc.Gate.ActiveMember(r.Context(), r.PathValue("id"), auth(r).UserID)
		if err != nil {
			return 0, nil, err
		}
		if !ok {
			return 0, nil, httpx.ErrNotFound("")
		}
		if m.Role != contracts.RoleOwner {
			return 0, nil, httpx.ErrRoleForbidden()
		}
		res, err := h.Svc.SendDigestOnce(r.Context(), r.PathValue("id"), body.Date, h.Clock.Now())
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, res, nil
	})
}
