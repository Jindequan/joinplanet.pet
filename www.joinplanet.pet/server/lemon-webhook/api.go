package main

// api.go — /api/v1 skeleton: middleware, shared helpers, module registration.
// Modules (auth/circle/pet/tasks/timeline/share/data) live in their own files
// and register via init() on apiModules / pubModules. main.go only calls
// a.mountAPI(mux). Function boundaries = business functions (APP-DESIGN §1.2).

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

// ---- module registration --------------------------------------------------

type moduleFunc func(mux *http.ServeMux, a *app)

var (
	apiModules []moduleFunc // mounted under /api/v1/
	pubModules []moduleFunc // mounted on the root mux (public /s/, /invite/)
)

// ---- shared context keys --------------------------------------------------

type ctxKey int

const (
	ctxUserID ctxKey = iota
)

// ---- helpers shared by all modules ----------------------------------------

func sha256Hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

func tokenFromRequest(req *http.Request) string {
	auth := req.Header.Get("Authorization")
	if len(auth) > 7 && strings.EqualFold(auth[:7], "Bearer ") {
		return strings.TrimSpace(auth[7:])
	}
	return ""
}

// currentUser resolves the Bearer token to a user id. Returns 0 when absent
// or invalid (expired sessions are deleted opportunistically).
func (a *app) currentUser(req *http.Request) int64 {
	token := tokenFromRequest(req)
	if token == "" {
		return 0
	}
	hash := sha256Hex(token)
	var userID int64
	var expiresAt time.Time
	err := a.pool.QueryRow(req.Context(),
		`SELECT user_id, expires_at FROM sessions WHERE token_hash = $1`, hash,
	).Scan(&userID, &expiresAt)
	if err != nil {
		return 0
	}
	if time.Now().After(expiresAt) {
		_, _ = a.pool.Exec(req.Context(), `DELETE FROM sessions WHERE token_hash = $1`, hash)
		return 0
	}
	// Sliding renewal: extend once at least half the lifetime has passed.
	if time.Until(expiresAt) < sessionTTL/2 {
		_, _ = a.pool.Exec(req.Context(),
			`UPDATE sessions SET expires_at = now() + $1 WHERE token_hash = $2`,
			sessionTTL, hash)
	}
	return userID
}

const sessionTTL = 7 * 24 * time.Hour

// requireAuth wraps handlers that need a logged-in user.
func (a *app) requireAuth(next func(w http.ResponseWriter, req *http.Request, userID int64)) http.HandlerFunc {
	return func(w http.ResponseWriter, req *http.Request) {
		userID := a.currentUser(req)
		if userID == 0 {
			jsonResponse(w, http.StatusUnauthorized, errBody("login required"))
			return
		}
		next(w, req.WithContext(context.WithValue(req.Context(), ctxUserID, userID)), userID)
	}
}

func userIDFrom(req *http.Request) int64 {
	if v, ok := req.Context().Value(ctxUserID).(int64); ok {
		return v
	}
	return 0
}

// circleRole returns the caller's role in the circle owning this pet, or "".
func (a *app) circleRoleForPet(ctx context.Context, petID, userID int64) (string, int64, error) {
	var role string
	var circleID int64
	err := a.pool.QueryRow(ctx,
		`SELECT m.role, p.circle_id
		   FROM pets p JOIN circle_members m ON m.circle_id = p.circle_id
		  WHERE p.id = $1 AND m.user_id = $2`, petID, userID,
	).Scan(&role, &circleID)
	return role, circleID, err
}

// requireMember guards a pet-scoped handler: any circle member passes.
// Routes are registered with Go 1.22 pattern syntax: "/pets/{petID}/…" under
// the /api/v1 strip prefix, so petID comes from req.PathValue.
func (a *app) requirePetMember(next func(w http.ResponseWriter, req *http.Request, userID, petID int64, role string)) http.HandlerFunc {
	return a.requireAuth(func(w http.ResponseWriter, req *http.Request, userID int64) {
		petID, ok := pathID(req, "petID")
		if !ok {
			jsonResponse(w, http.StatusBadRequest, errBody("invalid pet id"))
			return
		}
		role, _, err := a.circleRoleForPet(req.Context(), petID, userID)
		if err != nil {
			jsonResponse(w, http.StatusNotFound, errBody("pet not found"))
			return
		}
		next(w, req, userID, petID, role)
	})
}

// requireOwner guards owner-only mutations (share revoke, member removal…).
func (a *app) requirePetOwner(next func(w http.ResponseWriter, req *http.Request, userID, petID int64)) http.HandlerFunc {
	return a.requirePetMember(func(w http.ResponseWriter, req *http.Request, userID, petID int64, role string) {
		if role != "owner" {
			jsonResponse(w, http.StatusForbidden, errBody("owner only"))
			return
		}
		next(w, req, userID, petID)
	})
}

// pathID parses a numeric path value like "12".
func pathID(req *http.Request, name string) (int64, bool) {
	raw := req.PathValue(name)
	if raw == "" {
		return 0, false
	}
	var id int64
	for _, c := range raw {
		if c < '0' || c > '9' {
			return 0, false
		}
		id = id*10 + int64(c-'0')
	}
	return id, true
}

// readJSON decodes a bounded JSON body into dst.
func readJSON(req *http.Request, dst any) error {
	dec := json.NewDecoder(http.MaxBytesReader(nil, req.Body, 1<<20))
	return dec.Decode(dst)
}

// ---- mounting --------------------------------------------------------------

func (a *app) mountAPI(rootMux *http.ServeMux) {
	api := http.NewServeMux()
	for _, m := range apiModules {
		m(api, a)
	}
	rootMux.Handle("/api/v1/", http.StripPrefix("/api/v1", api))
	for _, m := range pubModules {
		m(rootMux, a)
	}
}
