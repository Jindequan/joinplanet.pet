package lifecycle

import (
	"net/http"

	"github.com/joinplanet/planet-api/internal/contracts"
	"github.com/joinplanet/planet-api/internal/platform/httpx"
)

type Handler struct{ Svc *Service }

func (h *Handler) Mount(mux *http.ServeMux) {
	mux.HandleFunc("DELETE /api/v1/account", h.deleteAccount)
}

func (h *Handler) deleteAccount(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		a, _ := contracts.AuthFrom(r.Context())
		var body struct {
			Confirm string `json:"confirm"` // 必须等于账号邮箱
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		if err := h.Svc.DeleteAccount(r.Context(), a.UserID, body.Confirm, a.Email); err != nil {
			return 0, nil, err
		}
		return http.StatusNoContent, nil, nil
	})
}
