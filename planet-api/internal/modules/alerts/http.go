package alerts

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
	mux.HandleFunc("GET /api/v1/families/{id}/alerts", h.list)
}

func auth(r *http.Request) contracts.Auth {
	a, _ := contracts.AuthFrom(r.Context())
	return a
}

// list：成员查看圈内预警（空结果 200 {"alerts":[]}）。
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		alerts, err := h.Svc.List(r.Context(), r.PathValue("id"), auth(r).UserID, h.Clock.Now())
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"alerts": alerts}, nil
	})
}
