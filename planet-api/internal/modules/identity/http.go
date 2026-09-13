package identity

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/joinplanet/planet-api/internal/contracts"
	"github.com/joinplanet/planet-api/internal/platform/httpx"
)

type Handler struct {
	Svc *Service
	// ActivationSummaryReader is injected by app composition so the identity
	// module exposes one stable activation contract without importing domain
	// modules (and creating a package cycle).
	ActivationSummaryReader func(context.Context, string) (ActivationSummary, error)
	// ListEntitlements 由 app 注入（entitlements.Service.ListForUser），
	// /me 返回权益列表供客户端展示档位与配额。
	ListEntitlements func(ctx context.Context, userID string) ([]map[string]any, error)
	// UsageSnapshot 返回 User-owned 的当前资源用量与上限。
	UsageSnapshot func(ctx context.Context, userID string, now time.Time) (map[string]any, error)
	// 验证码限流（BACKEND-DESIGN §4.1：邮箱 1/min + 10/day；IP 30/h）
	EmailPerMinute     *httpx.Limiter
	EmailPerDay        *httpx.Limiter
	IPPerHour          *httpx.Limiter
	DatabaseRateLimits bool
}

type ActivationSummary struct {
	Families            int  `json:"families"`
	ActivePets          int  `json:"active_pets"`
	PetsWithActivePlans int  `json:"pets_with_active_plans"`
	HasTodayItems       bool `json:"has_today_items"`
}

func (h *Handler) Mount(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/v1/auth/request-code", h.requestCode)
	mux.HandleFunc("POST /api/v1/auth/verify-code", h.verifyCode)
	mux.HandleFunc("DELETE /api/v1/auth/session", h.logout)
	mux.HandleFunc("GET /api/v1/me", h.me)
	mux.HandleFunc("GET /api/v1/me/capabilities", h.capabilities)
	mux.HandleFunc("GET /api/v1/me/activation-summary", h.activationSummary)
	mux.HandleFunc("GET /api/v1/me/usage", h.usage)
	mux.HandleFunc("PATCH /api/v1/me", h.patchMe)
	mux.HandleFunc("GET /api/v1/me/preferences", h.preferences)
	mux.HandleFunc("PATCH /api/v1/me/preferences", h.patchPreferences)
	mux.HandleFunc("GET /api/v1/me/sessions", h.sessions)
	mux.HandleFunc("DELETE /api/v1/me/sessions", h.revokeOtherSessions)
	mux.HandleFunc("DELETE /api/v1/me/sessions/{id}", h.revokeSession)
}

// capabilities is the client-facing product contract. Keep unavailable
// surfaces explicit so the app can expose shipped workflows without guessing
// from HTTP failures, while unfinished capabilities remain safely hidden.
func (h *Handler) capabilities(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		return http.StatusOK, map[string]any{
			"push_notifications": true,
			"digest":             true,
			"alerts":             true,
			"export_json":        true,
			"export_pdf":         false,
			"i18n":               []string{"zh-CN"},
			// The responsibility read model is mounted by app.New and is part of
			// the shipped collaboration surface. Leaving this false makes clients
			// hide an already-live responsibility view and creates a contract split
			// between the API and the UI.
			"care_responsibility_api": true,
			"activation_summary_api":  h.ActivationSummaryReader != nil,
		}, nil
	})
}

func (h *Handler) activationSummary(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		if h.ActivationSummaryReader == nil {
			return 0, nil, httpx.NewAppError(http.StatusNotImplemented, "ACTIVATION_SUMMARY_UNAVAILABLE", "activation summary is not configured")
		}
		a, _ := contracts.AuthFrom(r.Context())
		summary, err := h.ActivationSummaryReader(r.Context(), a.UserID)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, summary, nil
	})
}

func (h *Handler) requestCode(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		ip := httpx.ClientIP(r)
		if !h.allow(r, "auth_request_ip_hour", "ip:"+ip, time.Hour, 30, h.IPPerHour) {
			return 0, nil, httpx.ErrAuthRateLimited()
		}
		var body struct {
			Email string `json:"email"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		email, err := NormalizeEmail(body.Email)
		if err != nil {
			return 0, nil, err
		}
		if !h.allow(r, "auth_request_email_minute", email, time.Minute, 1, h.EmailPerMinute) ||
			!h.allow(r, "auth_request_email_day", email, 24*time.Hour, 10, h.EmailPerDay) {
			return 0, nil, httpx.ErrAuthRateLimited()
		}
		devCode, err := h.Svc.RequestCode(r.Context(), body.Email, ip)
		if err != nil {
			return 0, nil, err
		}
		resp := map[string]any{"sent": true}
		if devCode != "" {
			resp["dev_code"] = devCode // 仅 DEV_AUTH_CODES=1 时出现
		}
		return http.StatusAccepted, resp, nil
	})
}

func (h *Handler) verifyCode(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		if !h.allow(r, "auth_verify_ip_hour", "ip:"+httpx.ClientIP(r), time.Hour, 30, h.IPPerHour) {
			return 0, nil, httpx.ErrAuthRateLimited()
		}
		var body struct {
			Email  string `json:"email"`
			Code   string `json:"code"`
			Device string `json:"device"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		device := body.Device
		if device == "" {
			device = r.UserAgent()
		}
		res, err := h.Svc.VerifyCode(r.Context(), body.Email, body.Code, device)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{
			"token":      res.Token,
			"expires_at": res.ExpiresAt,
			"user":       userDTO(res.User),
		}, nil
	})
}

func (h *Handler) allow(r *http.Request, bucket, key string, window time.Duration, limit int, fallback *httpx.Limiter) bool {
	if h.DatabaseRateLimits && h.Svc != nil && h.Svc.Repo != nil && h.Svc.Pool != nil {
		allowed, err := h.Svc.Repo.AllowRateLimit(r.Context(), h.Svc.Pool, bucket, key, h.Svc.Clock.Now(), window, limit)
		return err == nil && allowed
	}
	return fallback != nil && fallback.Allow(key)
}

func (h *Handler) logout(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		a, _ := contracts.AuthFrom(r.Context())
		if err := h.Svc.Logout(r.Context(), a.SessionID); err != nil {
			return 0, nil, err
		}
		return http.StatusNoContent, nil, nil
	})
}

func (h *Handler) me(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		a, _ := contracts.AuthFrom(r.Context())
		ents := []map[string]any{}
		if h.ListEntitlements != nil {
			list, err := h.ListEntitlements(r.Context(), a.UserID)
			if err != nil {
				return 0, nil, err
			}
			ents = list
		}
		return http.StatusOK, map[string]any{
			"user": map[string]any{
				"id":           a.UserID,
				"email":        a.Email,
				"display_name": a.DisplayName,
				"locale":       a.Locale,
				"created_at":   a.CreatedAt,
			},
			"entitlements": ents,
		}, nil
	})
}

func (h *Handler) patchMe(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		a, _ := contracts.AuthFrom(r.Context())
		var body struct {
			DisplayName *string `json:"display_name"`
			Locale      *string `json:"locale"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		var u UserRow
		var err error
		if body.DisplayName != nil {
			u, err = h.Svc.UpdateName(r.Context(), a.UserID, *body.DisplayName)
		} else if body.Locale != nil {
			u, err = h.Svc.UpdateLocale(r.Context(), a.UserID, *body.Locale)
		} else {
			return 0, nil, httpx.ErrValidation("display_name or locale is required")
		}
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"user": userDTO(u)}, nil
	})
}

func (h *Handler) usage(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		a, _ := contracts.AuthFrom(r.Context())
		if h.UsageSnapshot == nil {
			return http.StatusOK, map[string]any{}, nil
		}
		usage, err := h.UsageSnapshot(r.Context(), a.UserID, time.Now().UTC())
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, usage, nil
	})
}

func (h *Handler) preferences(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		a, _ := contracts.AuthFrom(r.Context())
		p, err := h.Svc.Preferences(r.Context(), a.UserID)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"preferences": preferencesDTO(p)}, nil
	})
}

func (h *Handler) patchPreferences(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		a, _ := contracts.AuthFrom(r.Context())
		var body struct {
			DefaultFamilyID json.RawMessage `json:"default_family_id"`
			DefaultPetID    json.RawMessage `json:"default_pet_id"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		current, err := h.Svc.Preferences(r.Context(), a.UserID)
		if err != nil {
			return 0, nil, err
		}
		familyID, err := patchPreferenceID(body.DefaultFamilyID, current.DefaultFamilyID)
		if err != nil {
			return 0, nil, err
		}
		petID, err := patchPreferenceID(body.DefaultPetID, current.DefaultPetID)
		if err != nil {
			return 0, nil, err
		}
		p, err := h.Svc.UpdatePreferences(r.Context(), a.UserID, familyID, petID)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"preferences": preferencesDTO(p)}, nil
	})
}

func (h *Handler) sessions(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		a, _ := contracts.AuthFrom(r.Context())
		items, err := h.Svc.ListSessions(r.Context(), a.UserID, a.SessionID)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"sessions": items}, nil
	})
}

func (h *Handler) revokeSession(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		a, _ := contracts.AuthFrom(r.Context())
		if r.PathValue("id") == a.SessionID {
			return 0, nil, httpx.ErrValidation("current session must use logout")
		}
		if err := h.Svc.RevokeOwnedSession(r.Context(), a.UserID, r.PathValue("id")); err != nil {
			return 0, nil, err
		}
		return http.StatusNoContent, nil, nil
	})
}

func (h *Handler) revokeOtherSessions(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		a, _ := contracts.AuthFrom(r.Context())
		if r.URL.Query().Get("except_current") != "true" {
			return 0, nil, httpx.ErrValidation("except_current=true is required")
		}
		if err := h.Svc.RevokeOtherSessions(r.Context(), a.UserID, a.SessionID); err != nil {
			return 0, nil, err
		}
		return http.StatusNoContent, nil, nil
	})
}

func patchPreferenceID(raw json.RawMessage, current *string) (*string, error) {
	if len(raw) == 0 {
		return current, nil
	}
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return nil, nil
	}
	var value string
	if err := json.Unmarshal(raw, &value); err != nil || value == "" {
		return nil, httpx.ErrValidation("preference id must be a non-empty string or null")
	}
	return &value, nil
}

func preferencesDTO(p UserPreferences) map[string]any {
	return map[string]any{"user_id": p.UserID, "default_family_id": p.DefaultFamilyID, "default_pet_id": p.DefaultPetID, "created_at": p.CreatedAt, "updated_at": p.UpdatedAt}
}

func userDTO(u UserRow) map[string]any {
	return map[string]any{
		"id": u.ID, "email": u.Email,
		"display_name": u.DisplayName, "locale": u.Locale,
		"created_at": u.CreatedAt,
	}
}

// Middleware 将 Bearer token 解析为 contracts.Auth 注入 ctx（/me 所需字段一并携带）。
func (h *Handler) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := httpx.BearerToken(r)
		user, sess, err := h.Svc.Authenticate(r.Context(), token)
		if err != nil {
			httpx.WriteAppError(w, r, err)
			return
		}
		ctx := contracts.WithAuth(r.Context(), contracts.Auth{
			UserID:      user.ID,
			SessionID:   sess.ID,
			Email:       user.Email,
			DisplayName: user.DisplayName,
			Locale:      user.Locale,
			CreatedAt:   user.CreatedAt,
		})
		// Authenticate already filters at the repository boundary. Keep this
		// middleware guard as the last line of defence if another auth source is
		// introduced later.
		if user.Status != "active" {
			httpx.WriteAppError(w, r, httpx.ErrUnauthenticated("account is unavailable"))
			return
		}
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
