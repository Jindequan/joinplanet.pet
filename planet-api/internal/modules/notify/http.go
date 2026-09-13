package notify

import (
	"net/http"

	"github.com/joinplanet/planet-api/internal/contracts"
	"github.com/joinplanet/planet-api/internal/platform/httpx"
)

type Handler struct {
	Svc *Service
}

func (h *Handler) Mount(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/v1/me/push-tokens", h.addToken)
	mux.HandleFunc("DELETE /api/v1/me/push-tokens", h.deleteToken)
	mux.HandleFunc("GET /api/v1/families/{id}/notification-prefs", h.getPrefs)
	mux.HandleFunc("PUT /api/v1/families/{id}/notification-prefs", h.putPrefs)
}

func auth(r *http.Request) contracts.Auth {
	a, _ := contracts.AuthFrom(r.Context())
	return a
}

func (h *Handler) addToken(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		var body struct {
			Token    string `json:"token"`
			Platform string `json:"platform"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		t, err := h.Svc.RegisterToken(r.Context(), auth(r).UserID, body.Token, body.Platform)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusCreated, map[string]any{"push_token": t}, nil
	})
}

// deleteToken：体携 {token}（仅删本人令牌）。
func (h *Handler) deleteToken(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		var body struct {
			Token string `json:"token"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		if err := h.Svc.DeleteToken(r.Context(), auth(r).UserID, body.Token); err != nil {
			return 0, nil, err
		}
		return http.StatusNoContent, nil, nil
	})
}

func (h *Handler) getPrefs(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		p, err := h.Svc.Prefs(r.Context(), r.PathValue("id"), auth(r).UserID)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"prefs": p}, nil
	})
}

func (h *Handler) putPrefs(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		var body struct {
			Reminders *bool `json:"reminders"`
			Digest    *bool `json:"digest"`
			Alerts    *bool `json:"alerts"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		p, err := h.Svc.SetPrefs(r.Context(), r.PathValue("id"), auth(r).UserID,
			body.Reminders, body.Digest, body.Alerts)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"prefs": p}, nil
	})
}
