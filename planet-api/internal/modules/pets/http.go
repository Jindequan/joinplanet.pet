package pets

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/joinplanet/planet-api/internal/contracts"
	"github.com/joinplanet/planet-api/internal/platform/db"
	"github.com/joinplanet/planet-api/internal/platform/httpx"
)

type Handler struct{ Svc *Service }

func (h *Handler) Mount(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/v1/families/{id}/pets", h.create)
	mux.HandleFunc("GET /api/v1/families/{id}/pets", h.list)
	mux.HandleFunc("DELETE /api/v1/families/{family_id}/pets/{pet_id}", h.removeFromFamily)
	mux.HandleFunc("GET /api/v1/pets", h.listAccessible)
	mux.HandleFunc("GET /api/v1/pets/deleted", h.listDeleted)
	mux.HandleFunc("GET /api/v1/pets/{id}", h.get)
	mux.HandleFunc("GET /api/v1/pets/{id}/export", h.export)
	mux.HandleFunc("PATCH /api/v1/pets/{id}", h.update)
	mux.HandleFunc("PATCH /api/v1/pets/{id}/record", h.updateRecord)
	mux.HandleFunc("DELETE /api/v1/pets/{id}", h.delete)
	mux.HandleFunc("PATCH /api/v1/pets/{id}/profile", h.updateProfile)
	mux.HandleFunc("POST /api/v1/pets/{id}/archive", h.archive)
	mux.HandleFunc("POST /api/v1/pets/{id}/unarchive", h.unarchive)
	mux.HandleFunc("POST /api/v1/pets/{id}/restore", h.restore)
	mux.HandleFunc("POST /api/v1/pets/{id}/families", h.shareFamily)
	mux.HandleFunc("DELETE /api/v1/pets/{id}/families/{family_id}", h.unshareFamily)
	mux.HandleFunc("GET /api/v1/pets/{id}/access-grants", h.listAccessGrants)
	mux.HandleFunc("POST /api/v1/pets/{id}/access-grants", h.grantAccess)
	mux.HandleFunc("DELETE /api/v1/pets/{id}/access-grants/{grant_id}", h.revokeAccess)
}

func (h *Handler) shareFamily(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		key, err := httpx.RequireIdempotencyKey(r)
		if err != nil {
			return 0, nil, err
		}
		var body struct {
			FamilyID string `json:"family_id"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		if body.FamilyID == "" {
			return 0, nil, httpx.ErrValidation("family_id is required")
		}
		if err := h.Svc.ShareWithFamilyWithIdempotency(r.Context(), r.PathValue("id"), auth(r).UserID, body.FamilyID, key); err != nil {
			return 0, nil, err
		}
		return http.StatusCreated, map[string]any{"ok": true, "family_id": body.FamilyID}, nil
	})
}

func (h *Handler) unshareFamily(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		if err := h.Svc.UnshareFromFamily(r.Context(), r.PathValue("id"), auth(r).UserID, r.PathValue("family_id")); err != nil {
			return 0, nil, err
		}
		return http.StatusNoContent, nil, nil
	})
}

func (h *Handler) removeFromFamily(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		if err := h.Svc.RemoveFromFamily(r.Context(), r.PathValue("family_id"), r.PathValue("pet_id"), auth(r).UserID); err != nil {
			return 0, nil, err
		}
		return http.StatusNoContent, nil, nil
	})
}

func (h *Handler) listAccessGrants(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		grants, err := h.Svc.ListAccessGrants(r.Context(), r.PathValue("id"), auth(r).UserID)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"grants": grants}, nil
	})
}

func (h *Handler) grantAccess(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		key, err := httpx.RequireIdempotencyKey(r)
		if err != nil {
			return 0, nil, err
		}
		var body struct {
			UserID    string         `json:"user_id"`
			Role      contracts.Role `json:"role"`
			ExpiresAt string         `json:"expires_at"`
		}
		if err := httpx.DecodeJSON(r, &body); err != nil {
			return 0, nil, err
		}
		var expiresAt *time.Time
		if body.ExpiresAt != "" {
			t, err := time.Parse(time.RFC3339, body.ExpiresAt)
			if err != nil {
				return 0, nil, httpx.ErrValidation("expires_at must be RFC3339")
			}
			expiresAt = &t
		}
		grant, err := h.Svc.GrantAccessWithIdempotency(r.Context(), r.PathValue("id"), auth(r).UserID, body.UserID, body.Role, expiresAt, key)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusCreated, map[string]any{"grant": grant}, nil
	})
}

func (h *Handler) revokeAccess(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		if err := h.Svc.RevokeAccess(r.Context(), r.PathValue("id"), auth(r).UserID, r.PathValue("grant_id")); err != nil {
			return 0, nil, err
		}
		return http.StatusNoContent, nil, nil
	})
}

func auth(r *http.Request) contracts.Auth {
	a, _ := contracts.AuthFrom(r.Context())
	return a
}

// petBody 是创建/更新的公共字段（更新时零值表示"不改"）。
type petBody struct {
	Name      *string `json:"name"`
	Species   *string `json:"species"`
	Breed     *string `json:"breed"`
	BirthDate *string `json:"birth_date"` // YYYY-MM-DD，空串可清空
	Sex       *string `json:"sex"`
	Neutered  *bool   `json:"neutered"`
	WeightG   *int    `json:"weight_g"`
	Version   *int    `json:"version"` // 更新必传（乐观锁）
	Confirm   *string `json:"confirm"` // 删除必传 = pet id
}

func parseDate(s string) (*time.Time, error) {
	if s == "" {
		return nil, nil
	}
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return nil, httpx.ErrValidation("birth_date must be YYYY-MM-DD")
	}
	return &t, nil
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		key, err := httpx.RequireIdempotencyKey(r)
		if err != nil {
			return 0, nil, err
		}
		familyID := r.PathValue("id")
		// 归属校验由 service 在同一事务内完成：必须是该家庭 owner。
		if _, ok, err := h.Svc.Members.ActiveMember(r.Context(), familyID, auth(r).UserID); err != nil {
			return 0, nil, err
		} else if !ok {
			return 0, nil, httpx.ErrNotFound("")
		}
		var b petBody
		if err := httpx.DecodeJSON(r, &b); err != nil {
			return 0, nil, err
		}
		name, species, breed, sex := "", "", "", ""
		if b.Name != nil {
			name = *b.Name
		}
		if b.Species != nil {
			species = *b.Species
		}
		if b.Breed != nil {
			breed = *b.Breed
		}
		if b.Sex != nil {
			sex = *b.Sex
		}
		var birth *time.Time
		if b.BirthDate != nil {
			var err error
			if birth, err = parseDate(*b.BirthDate); err != nil {
				return 0, nil, err
			}
		}
		pet, err := h.Svc.CreateWithIdempotency(r.Context(), CreateParams{
			FamilyID: familyID, Name: name, Species: species, Breed: breed,
			BirthDate: birth, Sex: sex, Neutered: derefBool(b.Neutered), WeightG: b.WeightG,
		}, auth(r).UserID, key)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusCreated, map[string]any{"pet": petDTO(pet)}, nil
	})
}

func derefBool(b *bool) bool {
	if b == nil {
		return false
	}
	return *b
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		pets, err := h.Svc.ListByFamily(r.Context(), r.PathValue("id"), auth(r).UserID)
		if err != nil {
			return 0, nil, err
		}
		out := make([]map[string]any, len(pets))
		for i, p := range pets {
			out[i] = petDTO(p)
		}
		return http.StatusOK, map[string]any{"pets": out}, nil
	})
}

func (h *Handler) listAccessible(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		pets, err := h.Svc.ListAccessibleForUser(r.Context(), auth(r).UserID)
		if err != nil {
			return 0, nil, err
		}
		out := make([]map[string]any, len(pets))
		for i, p := range pets {
			out[i] = petDTO(p)
		}
		return http.StatusOK, map[string]any{"pets": out}, nil
	})
}

func (h *Handler) listDeleted(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		pets, err := h.Svc.ListDeletedByOwner(r.Context(), auth(r).UserID)
		if err != nil {
			return 0, nil, err
		}
		out := make([]map[string]any, len(pets))
		for i, pet := range pets {
			out[i] = petDTO(pet)
		}
		return http.StatusOK, map[string]any{"pets": out}, nil
	})
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		pet, profile, err := h.Svc.Get(r.Context(), r.PathValue("id"), auth(r).UserID)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"pet": petDTO(pet), "profile": profileDTO(profile)}, nil
	})
}

func (h *Handler) export(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		data, err := h.Svc.Export(r.Context(), r.PathValue("id"), auth(r).UserID)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, data, nil
	})
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		var b petBody
		if err := httpx.DecodeJSON(r, &b); err != nil {
			return 0, nil, err
		}
		if b.Version == nil {
			return 0, nil, httpx.ErrValidation("version is required for updates")
		}
		// 体重唯一写入路径 = weight 时间线事件（冗余账本条目）；
		// PATCH 直接改 weight_g 会绕过事件造成账实分离 → 显式拒绝
		if b.WeightG != nil {
			return 0, nil, httpx.ErrValidation("weight changes go through timeline weight events")
		}
		var birth *time.Time
		if b.BirthDate != nil {
			var err error
			if birth, err = parseDate(*b.BirthDate); err != nil {
				return 0, nil, err
			}
		}
		pet, err := h.Svc.Update(r.Context(), r.PathValue("id"), auth(r).UserID, UpdateParams{
			Version: *b.Version, Name: b.Name, Species: b.Species, Breed: b.Breed, Sex: b.Sex,
			BirthDate: birth, BirthDateSet: b.BirthDate != nil, Neutered: b.Neutered,
		})
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"pet": petDTO(pet)}, nil
	})
}

func (h *Handler) updateRecord(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		key, err := httpx.RequireIdempotencyKey(r)
		if err != nil {
			return 0, nil, err
		}
		var b struct {
			Name              *string          `json:"name"`
			Species           *string          `json:"species"`
			Breed             *string          `json:"breed"`
			BirthDate         *string          `json:"birth_date"`
			Sex               *string          `json:"sex"`
			Neutered          *bool            `json:"neutered"`
			Version           *int             `json:"version"`
			Allergies         *json.RawMessage `json:"allergies"`
			Conditions        *json.RawMessage `json:"conditions"`
			EmergencyContacts *json.RawMessage `json:"emergency_contacts"`
			MedDecisionMaker  *json.RawMessage `json:"med_decision_maker"`
			Notes             *string          `json:"notes"`
		}
		if err := httpx.DecodeJSON(r, &b); err != nil {
			return 0, nil, err
		}
		if b.Version == nil {
			return 0, nil, httpx.ErrValidation("version is required for updates")
		}
		var birth *time.Time
		if b.BirthDate != nil {
			var err error
			if birth, err = parseDate(*b.BirthDate); err != nil {
				return 0, nil, err
			}
		}
		requestBody, err := json.Marshal(b)
		if err != nil {
			return 0, nil, err
		}
		pet, profile, err := h.Svc.UpdateRecord(r.Context(), r.PathValue("id"), auth(r).UserID, UpdateParams{
			Version: *b.Version, Name: b.Name, Species: b.Species, Breed: b.Breed, Sex: b.Sex,
			BirthDate: birth, BirthDateSet: b.BirthDate != nil, Neutered: b.Neutered,
		}, ProfilePatch{
			Allergies: b.Allergies, Conditions: b.Conditions, EmergencyContacts: b.EmergencyContacts,
			MedDecisionMaker: b.MedDecisionMaker, Notes: b.Notes,
		}, key, db.RequestHash(string(requestBody)))
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"pet": petDTO(pet), "profile": profileDTO(profile)}, nil
	})
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		var b petBody
		if err := httpx.DecodeJSON(r, &b); err != nil {
			return 0, nil, err
		}
		confirm := ""
		if b.Confirm != nil {
			confirm = *b.Confirm
		}
		if err := h.Svc.Delete(r.Context(), r.PathValue("id"), auth(r).UserID, confirm); err != nil {
			return 0, nil, err
		}
		return http.StatusNoContent, nil, nil
	})
}

func (h *Handler) updateProfile(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		var p struct {
			Allergies         *json.RawMessage `json:"allergies"`
			Conditions        *json.RawMessage `json:"conditions"`
			EmergencyContacts *json.RawMessage `json:"emergency_contacts"`
			MedDecisionMaker  *json.RawMessage `json:"med_decision_maker"`
			Notes             *string          `json:"notes"`
		}
		if err := httpx.DecodeJSON(r, &p); err != nil {
			return 0, nil, err
		}
		out, err := h.Svc.UpdateProfilePatch(r.Context(), r.PathValue("id"), auth(r).UserID, ProfilePatch{
			Allergies: p.Allergies, Conditions: p.Conditions, EmergencyContacts: p.EmergencyContacts,
			MedDecisionMaker: p.MedDecisionMaker, Notes: p.Notes,
		})
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"profile": profileDTO(out)}, nil
	})
}

func (h *Handler) archive(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		pet, err := h.Svc.Archive(r.Context(), r.PathValue("id"), auth(r).UserID, true)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"pet": petDTO(pet)}, nil
	})
}

func (h *Handler) unarchive(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		pet, err := h.Svc.Archive(r.Context(), r.PathValue("id"), auth(r).UserID, false)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"pet": petDTO(pet)}, nil
	})
}

func (h *Handler) restore(w http.ResponseWriter, r *http.Request) {
	httpx.Handle(w, r, func() (int, any, error) {
		pet, err := h.Svc.Restore(r.Context(), r.PathValue("id"), auth(r).UserID)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, map[string]any{"pet": petDTO(pet)}, nil
	})
}

func petDTO(p contracts.Pet) map[string]any {
	m := map[string]any{
		"id": p.ID, "name": p.Name,
		"species": p.Species, "breed": p.Breed, "sex": p.Sex,
		"neutered": p.Neutered, "version": p.Version,
		"created_by_user_id": p.CreatedByUserID, "current_owner_user_id": p.CurrentOwnerUserID,
		"created_at": p.CreatedAt, "updated_at": p.UpdatedAt,
	}
	if p.AccessRole != "" {
		m["access_role"] = p.AccessRole
	}
	if len(p.FamilyRoles) > 0 {
		m["family_roles"] = p.FamilyRoles
	}
	if len(p.FamilyIDs) > 0 {
		m["family_ids"] = p.FamilyIDs
	}
	if p.PrimaryFamilyID != "" {
		m["primary_family_id"] = p.PrimaryFamilyID
	}
	if p.BirthDate != nil {
		m["birth_date"] = p.BirthDate.Format("2006-01-02")
	}
	if p.WeightG != nil {
		m["weight_g"] = *p.WeightG
	}
	if p.ArchivedAt != nil {
		m["archived_at"] = p.ArchivedAt
	}
	return m
}

func profileDTO(p Profile) map[string]any {
	m := map[string]any{
		"allergies":          rawOr(p.Allergies, json.RawMessage("[]")),
		"conditions":         rawOr(p.Conditions, json.RawMessage("[]")),
		"emergency_contacts": rawOr(p.EmergencyContacts, json.RawMessage("[]")),
		"notes":              p.Notes,
		"updated_at":         p.UpdatedAt,
	}
	if len(p.MedDecisionMaker) > 0 {
		m["med_decision_maker"] = p.MedDecisionMaker
	}
	return m
}

func rawOr(b json.RawMessage, def json.RawMessage) json.RawMessage {
	if len(b) == 0 {
		return def
	}
	return b
}
