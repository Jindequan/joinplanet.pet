package main

// share.go — F6/F7 私密分享链接：创建 / 列表 / 撤销。
// 公开渲染页（/s/{token}、/invite/{code}）在 share_pages.go；数据生命周期在 data.go。
// 契约：docs/product/API-CONTRACT.md F6/F7。

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

func init() {
	apiModules = append(apiModules, func(mux *http.ServeMux, a *app) {
		mux.HandleFunc("POST /pets/{petID}/shares", a.requirePetMember(a.handleCreateShare))
		mux.HandleFunc("GET /pets/{petID}/shares", a.requirePetMember(a.handleListShares))
		mux.HandleFunc("DELETE /shares/{shareID}", a.requireShareOwner(a.handleRevokeShare))
	})
}

// ---- request / response shapes ---------------------------------------------

// shareIncludesInput 用 *bool 区分“未传”（默认 true）与显式 false（spec §54 逐项排除）。
type shareIncludesInput struct {
	Profile     *bool `json:"profile"`
	Allergies   *bool `json:"allergies"`
	Medications *bool `json:"medications"`
	Events      *bool `json:"events"`
	Weight      *bool `json:"weight"`
	Visits      *bool `json:"visits"`
}

type shareIncludesDoc struct {
	Profile     bool `json:"profile"`
	Allergies   bool `json:"allergies"`
	Medications bool `json:"medications"`
	Events      bool `json:"events"`
	Weight      bool `json:"weight"`
	Visits      bool `json:"visits"`
}

type sharePayloadDoc struct {
	Reason   string           `json:"reason"`
	Includes shareIncludesDoc `json:"includes"`
}

// withDefaults 把 nil 字段补成 true（契约：默认 includes 全 true）。
func (in shareIncludesInput) withDefaults() shareIncludesDoc {
	val := func(p *bool) bool { return p == nil || *p }
	return shareIncludesDoc{
		Profile:     val(in.Profile),
		Allergies:   val(in.Allergies),
		Medications: val(in.Medications),
		Events:      val(in.Events),
		Weight:      val(in.Weight),
		Visits:      val(in.Visits),
	}
}

type createShareRequest struct {
	Kind     string             `json:"kind"`
	TTLHours int                `json:"ttl_hours"`
	Reason   string             `json:"reason"`
	Includes shareIncludesInput `json:"includes"`
}

// shareCreatedView — POST 响应（契约：{id,kind,token,url,expires_at,view_count}）。
type shareCreatedView struct {
	ID        int64     `json:"id"`
	Kind      string    `json:"kind"`
	Token     string    `json:"token"`
	URL       string    `json:"url"`
	ExpiresAt time.Time `json:"expires_at"`
	ViewCount int       `json:"view_count"`
}

// shareListItem — GET 列表项（契约：{id,kind,url,expires_at,revoked_at,view_count,status}）。
type shareListItem struct {
	ID        int64      `json:"id"`
	Kind      string     `json:"kind"`
	URL       string     `json:"url"`
	ExpiresAt time.Time  `json:"expires_at"`
	RevokedAt *time.Time `json:"revoked_at"`
	ViewCount int        `json:"view_count"`
	Status    string     `json:"status"`
}

// ---- handlers ---------------------------------------------------------------

func (a *app) handleCreateShare(w http.ResponseWriter, req *http.Request, userID, petID int64, _ string) {
	var body createShareRequest
	if err := readJSON(req, &body); err != nil {
		jsonResponse(w, http.StatusBadRequest, errBody("invalid request body"))
		return
	}
	if body.Kind != "summary" && body.Kind != "care" {
		jsonResponse(w, http.StatusBadRequest, errBody("kind must be summary or care"))
		return
	}
	switch body.TTLHours {
	case 24, 72, 168:
	default:
		jsonResponse(w, http.StatusBadRequest, errBody("ttl_hours must be 24, 72 or 168"))
		return
	}
	token, err := shareNewToken()
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not create token"))
		return
	}
	payload, err := json.Marshal(sharePayloadDoc{
		Reason:   truncate(strings.TrimSpace(body.Reason), 500),
		Includes: body.Includes.withDefaults(),
	})
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not create share"))
		return
	}
	view := shareCreatedView{}
	err = a.pool.QueryRow(req.Context(), `
		INSERT INTO share_links (pet_id, kind, token, payload, expires_at, created_by)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, kind, token, expires_at, view_count`,
		petID, body.Kind, token, payload,
		time.Now().Add(time.Duration(body.TTLHours)*time.Hour), userID,
	).Scan(&view.ID, &view.Kind, &view.Token, &view.ExpiresAt, &view.ViewCount)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not create share"))
		return
	}
	view.URL = baseURLFor(req) + "/s/" + view.Token
	jsonResponse(w, http.StatusOK, map[string]any{"share": view})
}

func (a *app) handleListShares(w http.ResponseWriter, req *http.Request, _, petID int64, _ string) {
	rows, err := a.pool.Query(req.Context(), `
		SELECT id, kind, token, expires_at, revoked_at, view_count
		  FROM share_links WHERE pet_id = $1
		 ORDER BY created_at DESC, id DESC`, petID)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not list shares"))
		return
	}
	defer rows.Close()
	items := []shareListItem{}
	for rows.Next() {
		var it shareListItem
		var token string
		if err := rows.Scan(&it.ID, &it.Kind, &token, &it.ExpiresAt, &it.RevokedAt, &it.ViewCount); err != nil {
			jsonResponse(w, http.StatusInternalServerError, errBody("could not list shares"))
			return
		}
		it.URL = baseURLFor(req) + "/s/" + token
		it.Status = shareStatusFor(it.ExpiresAt, it.RevokedAt)
		items = append(items, it)
	}
	if err := rows.Err(); err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not list shares"))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]any{"shares": items})
}

func (a *app) handleRevokeShare(w http.ResponseWriter, req *http.Request, _, shareID int64) {
	tag, err := a.pool.Exec(req.Context(),
		`UPDATE share_links SET revoked_at = COALESCE(revoked_at, now()) WHERE id = $1`, shareID)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not revoke share"))
		return
	}
	if tag.RowsAffected() == 0 {
		jsonResponse(w, http.StatusNotFound, errBody("share not found"))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]bool{"ok": true})
}

// requireShareOwner — /shares/{shareID} 路径不含 petID，需先回查 pet 再做 owner 校验。
func (a *app) requireShareOwner(next func(w http.ResponseWriter, req *http.Request, userID, shareID int64)) http.HandlerFunc {
	return a.requireAuth(func(w http.ResponseWriter, req *http.Request, userID int64) {
		shareID, ok := pathID(req, "shareID")
		if !ok {
			jsonResponse(w, http.StatusBadRequest, errBody("invalid share id"))
			return
		}
		var petID int64
		err := a.pool.QueryRow(req.Context(),
			`SELECT pet_id FROM share_links WHERE id = $1`, shareID).Scan(&petID)
		if err != nil {
			jsonResponse(w, http.StatusNotFound, errBody("share not found"))
			return
		}
		role, _, err := a.circleRoleForPet(req.Context(), petID, userID)
		if err != nil {
			jsonResponse(w, http.StatusNotFound, errBody("share not found"))
			return
		}
		if role != "owner" {
			jsonResponse(w, http.StatusForbidden, errBody("owner only"))
			return
		}
		next(w, req, userID, shareID)
	})
}

// ---- helpers ----------------------------------------------------------------

// shareStatusFor — 状态计算：revoked_at 非空 → revoked；expires_at 已过 → expired；否则 active。
func shareStatusFor(expiresAt time.Time, revokedAt *time.Time) string {
	if revokedAt != nil {
		return "revoked"
	}
	if time.Now().After(expiresAt) {
		return "expired"
	}
	return "active"
}

// shareNewToken — crypto/rand 12 字节 → 24 个小写 hex 字符（随机即权限）。
func shareNewToken() (string, error) {
	buf := make([]byte, 12)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}
