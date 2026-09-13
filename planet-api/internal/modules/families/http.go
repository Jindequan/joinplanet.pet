package families

import (
	"net/http"

	"github.com/joinplanet/planet-api/internal/contracts"
	"github.com/joinplanet/planet-api/internal/platform/httpx"
)

type Handler struct {
	Svc *Service
	// JoinPerHour：按 IP 限制邀请码尝试频率（防穷举），app 注入。
	JoinPerHour *httpx.Limiter
	// InvitePreviewPerHour prevents anonymous brute-force probing of invite
	// codes before a user has authenticated.
	InvitePreviewPerHour *httpx.Limiter
}

func (h *Handler) Mount(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/v1/families", h.create)
	mux.HandleFunc("POST /api/v1/families/join", h.join)
	mux.HandleFunc("GET /api/v1/families", h.list)
	mux.HandleFunc("GET /api/v1/families/deleted", h.listDeleted)
	mux.HandleFunc("GET /api/v1/families/{id}", h.detail)
	mux.HandleFunc("GET /api/v1/families/{id}/audit-records", h.auditRecords)
	mux.HandleFunc("PATCH /api/v1/families/{id}", h.update)
	mux.HandleFunc("POST /api/v1/families/{id}/invite/refresh", h.refreshInvite)
	mux.HandleFunc("DELETE /api/v1/families/{id}/members/{userId}", h.removeMember)
	mux.HandleFunc("PATCH /api/v1/families/{id}/members/{userId}", h.updateMemberRole)
	mux.HandleFunc("POST /api/v1/families/{id}/leave", h.leave)
	mux.HandleFunc("GET /api/v1/families/{id}/usage", h.usage)
	mux.HandleFunc("POST /api/v1/families/{id}/transfer", h.transfer)
	mux.HandleFunc("DELETE /api/v1/families/{id}", h.deleteFamily)
	mux.HandleFunc("POST /api/v1/families/{id}/restore", h.restore)
	mux.HandleFunc("GET /api/v1/invite/{code}", h.invitePreview)
}

func (h *Handler) transfer(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		key, err := httpx.RequireIdempotencyKey(r)
		if err != nil {
			return 0, nil, err
		}
		var body struct {
			ToUserID string `json:"to_user_id"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		if err := h.Svc.TransferOwnership(r.Context(), r.PathValue("id"), auth(r).UserID, body.ToUserID, key); err != nil {
			return 0, nil, err
		}
		c, members, err := h.Svc.Detail(r.Context(), r.PathValue("id"), auth(r).UserID)
		if err != nil {
			return 0, nil, err
		}
		ms := make([]map[string]any, len(members))
		for i, m := range members {
			ms[i] = map[string]any{
				"user_id": m.UserID, "display_name": m.DisplayName,
				"role": m.Role, "joined_at": m.JoinedAt,
			}
		}
		return http.StatusOK, map[string]any{"family": familyDTO(c), "members": ms}, nil
	})
}

func (h *Handler) deleteFamily(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		var body struct {
			Confirm string `json:"confirm"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		if err := h.Svc.DeleteFamily(r.Context(), r.PathValue("id"), auth(r).UserID, body.Confirm); err != nil {
			return 0, nil, err
		}
		return http.StatusNoContent, nil, nil
	})
}

func (h *Handler) restore(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		c, err := h.Svc.Restore(r.Context(), r.PathValue("id"), auth(r).UserID)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"family": familyDTO(c)}, nil
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
			Name     string `json:"name"`
			Timezone string `json:"timezone"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		c, invite, err := h.Svc.CreateWithIdempotency(r.Context(), auth(r).UserID, body.Name, body.Timezone, key)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusCreated, map[string]any{"family": familyDTO(c), "invite_code": invite}, nil
	})
}

func (h *Handler) join(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		if h.JoinPerHour != nil && !h.JoinPerHour.Allow("join:"+httpx.ClientIP(r)) {
			return 0, nil, httpx.NewAppError(http.StatusTooManyRequests, "JOIN_RATE_LIMITED", "too many join attempts, try later")
		}
		key, err := httpx.RequireIdempotencyKey(r)
		if err != nil {
			return 0, nil, err
		}
		var body struct {
			Code string `json:"code"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		c, err := h.Svc.JoinWithIdempotency(r.Context(), auth(r).UserID, body.Code, key)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"family": familyDTO(c)}, nil
	})
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		list, err := h.Svc.List(r.Context(), auth(r).UserID)
		if err != nil {
			return 0, nil, err
		}
		out := make([]map[string]any, len(list))
		for i, c := range list {
			out[i] = familyDTO(c)
		}
		return http.StatusOK, map[string]any{"families": out}, nil
	})
}

func (h *Handler) listDeleted(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		list, err := h.Svc.ListDeleted(r.Context(), auth(r).UserID)
		if err != nil {
			return 0, nil, err
		}
		out := make([]map[string]any, 0, len(list))
		for _, c := range list {
			out = append(out, map[string]any{"id": c.ID, "name": c.Name, "deleted_at": c.DeletedAt})
		}
		return http.StatusOK, map[string]any{"families": out}, nil
	})
}

func (h *Handler) detail(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		c, members, err := h.Svc.Detail(r.Context(), r.PathValue("id"), auth(r).UserID)
		if err != nil {
			return 0, nil, err
		}
		ms := make([]map[string]any, len(members))
		for i, m := range members {
			ms[i] = map[string]any{
				"user_id": m.UserID, "email": m.Email,
				"display_name": m.DisplayName, "role": m.Role, "joined_at": m.JoinedAt,
			}
		}
		return http.StatusOK, map[string]any{"family": familyDTO(c), "members": ms}, nil
	})
}

func (h *Handler) auditRecords(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		limit := 50
		items, err := h.Svc.ListAudit(r.Context(), r.PathValue("id"), auth(r).UserID, limit)
		if err != nil {
			return 0, nil, err
		}
		out := make([]map[string]any, 0, len(items))
		for _, item := range items {
			out = append(out, map[string]any{
				"id":            item.ID,
				"actor_user_id": item.ActorUserID,
				"actor_name":    item.ActorName,
				"action":        item.Action,
				"resource_type": item.ResourceType,
				"resource_id":   item.ResourceID,
				"occurred_at":   item.OccurredAt,
				"metadata":      item.Metadata,
			})
		}
		return http.StatusOK, map[string]any{"records": out}, nil
	})
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		var body struct {
			Name     *string `json:"name"`
			Timezone *string `json:"timezone"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		name, tz := "", ""
		if body.Name != nil {
			name = *body.Name
		}
		if body.Timezone != nil {
			tz = *body.Timezone
		}
		c, err := h.Svc.Update(r.Context(), r.PathValue("id"), auth(r).UserID, name, tz)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"family": familyDTO(c)}, nil
	})
}

func (h *Handler) refreshInvite(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		key, err := httpx.RequireIdempotencyKey(r)
		if err != nil {
			return 0, nil, err
		}
		var body struct {
			Role string `json:"role"`
		}
		// Older clients sent JSON null here; preserve that backwards-compatible
		// call as the default caregiver invite while new clients send {role}.
		if r.Body != nil && r.ContentLength > 0 && r.ContentLength != 4 {
			if err := httpx.DecodeJSON(r, &body); err != nil {
				return 0, nil, err
			}
		}
		role := contracts.Role(body.Role)
		if role == "" {
			role = contracts.RoleCaregiver
		}
		code, err := h.Svc.RefreshInviteWithRoleAndIdempotency(r.Context(), r.PathValue("id"), auth(r).UserID, role, key)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"invite_code": code}, nil
	})
}

func (h *Handler) updateMemberRole(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		var body struct {
			Role string `json:"role"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		if err := h.Svc.UpdateMemberRole(
			r.Context(),
			r.PathValue("id"),
			auth(r).UserID,
			r.PathValue("userId"),
			contracts.Role(body.Role),
		); err != nil {
			return 0, nil, err
		}
		return http.StatusNoContent, nil, nil
	})
}

func (h *Handler) removeMember(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		err := h.Svc.RemoveMember(r.Context(), r.PathValue("id"), auth(r).UserID, r.PathValue("userId"))
		if err != nil {
			return 0, nil, err
		}
		return http.StatusNoContent, nil, nil
	})
}

func (h *Handler) leave(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		err := h.Svc.Leave(r.Context(), r.PathValue("id"), auth(r).UserID)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusNoContent, nil, nil
	})
}

func (h *Handler) invitePreview(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		if h.InvitePreviewPerHour != nil && !h.InvitePreviewPerHour.Allow("invite-preview:"+httpx.ClientIP(r)) {
			return 0, nil, httpx.NewAppError(http.StatusTooManyRequests, "JOIN_RATE_LIMITED", "too many invite attempts, try later")
		}
		prev, err := h.Svc.PreviewInvite(r.Context(), r.PathValue("code"))
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, prev, nil
	})
}

func (h *Handler) usage(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		usage, err := h.Svc.Usage(r.Context(), r.PathValue("id"), auth(r).UserID)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, usage, nil
	})
}

func familyDTO(c contracts.Family) map[string]any {
	out := map[string]any{
		"id": c.ID, "name": c.Name, "timezone": c.Timezone,
		"role": c.Role, "created_at": c.CreatedAt,
		"pet_count": c.PetCount,
	}
	if c.MemberCount > 0 {
		out["member_count"] = c.MemberCount
	}
	return out
}
