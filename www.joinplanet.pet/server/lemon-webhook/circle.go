package main

// circle.go — F2 圈子模块: create (circle + first pet + owner membership in
// one transaction), join by invite code, member listing, rolling invite-code
// refresh, member removal and circle profile patch.
//
// Circle routes carry no pet context, so guards resolve membership directly
// against circle_members (same pattern as requirePetMember in api.go).

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"
	"time"

	_ "time/tzdata" // embedded tz database so time.LoadLocation works on bare containers

	"github.com/jackc/pgx/v5"
)

func init() {
	apiModules = append(apiModules, func(mux *http.ServeMux, a *app) {
		mux.HandleFunc("POST /circles", a.requireAuth(a.handleCreateCircle))
		mux.HandleFunc("POST /circles/join", a.requireAuth(a.handleJoinCircle))
		mux.HandleFunc("GET /circles/{circleID}", a.requireCircleMember(a.handleGetCircle))
		mux.HandleFunc("POST /circles/{circleID}/invite", a.requireCircleOwner(a.handleRefreshInvite))
		mux.HandleFunc("DELETE /circles/{circleID}/members/{userID}", a.requireCircleOwner(a.handleRemoveMember))
		mux.HandleFunc("PATCH /circles/{circleID}", a.requireCircleOwner(a.handlePatchCircle))
	})
}

// ---- circle guards ---------------------------------------------------------

// circleRole returns the caller's role in a circle ("" / ErrNoRows if not a member).
func (a *app) circleRole(ctx context.Context, circleID, userID int64) (string, error) {
	var role string
	err := a.pool.QueryRow(ctx,
		`SELECT role FROM circle_members WHERE circle_id = $1 AND user_id = $2`,
		circleID, userID).Scan(&role)
	return role, err
}

// requireCircleMember guards a circle-scoped handler: any circle member passes.
func (a *app) requireCircleMember(next func(w http.ResponseWriter, req *http.Request, userID, circleID int64, role string)) http.HandlerFunc {
	return a.requireAuth(func(w http.ResponseWriter, req *http.Request, userID int64) {
		circleID, ok := pathID(req, "circleID")
		if !ok {
			jsonResponse(w, http.StatusBadRequest, errBody("invalid circle id"))
			return
		}
		role, err := a.circleRole(req.Context(), circleID, userID)
		if err != nil {
			jsonResponse(w, http.StatusNotFound, errBody("circle not found"))
			return
		}
		next(w, req, userID, circleID, role)
	})
}

// requireCircleOwner guards owner-only circle mutations.
func (a *app) requireCircleOwner(next func(w http.ResponseWriter, req *http.Request, userID, circleID int64)) http.HandlerFunc {
	return a.requireCircleMember(func(w http.ResponseWriter, req *http.Request, userID, circleID int64, role string) {
		if role != "owner" {
			jsonResponse(w, http.StatusForbidden, errBody("owner only"))
			return
		}
		next(w, req, userID, circleID)
	})
}

// ---- shapes & helpers --------------------------------------------------------

type circleJSON struct {
	ID         int64   `json:"id"`
	Name       string  `json:"name"`
	Timezone   string  `json:"timezone"`
	InviteCode *string `json:"invite_code,omitempty"`
}

type memberJSON struct {
	UserID      int64     `json:"user_id"`
	DisplayName string    `json:"display_name"`
	Email       string    `json:"email"`
	Role        string    `json:"role"`
	JoinedAt    time.Time `json:"joined_at"`
}

// newInviteCode returns 16 hex chars from crypto/rand (64 bits of entropy).
func newInviteCode() string {
	buf := make([]byte, 8)
	_, _ = rand.Read(buf) // crypto/rand never returns an error on supported platforms
	return hex.EncodeToString(buf)
}

// circleTodayDate returns YYYY-MM-DD for "now" in a circle timezone.
func circleTodayDate(tz string) string {
	return time.Now().In(zoneOrDefault(tz)).Format("2006-01-02")
}

func zoneOrDefault(tz string) *time.Location {
	if loc, err := time.LoadLocation(tz); err == nil {
		return loc
	}
	return time.UTC
}

func validTimezone(tz string) bool {
	_, err := time.LoadLocation(tz)
	return err == nil
}

// ---- handlers ----------------------------------------------------------------

func (a *app) handleCreateCircle(w http.ResponseWriter, req *http.Request, userID int64) {
	var body struct {
		PetName  string `json:"pet_name"`
		Species  string `json:"species"`
		Breed    string `json:"breed"`
		Timezone string `json:"timezone"`
	}
	if err := readJSON(req, &body); err != nil {
		jsonResponse(w, http.StatusBadRequest, errBody("invalid request body"))
		return
	}
	petName := strings.TrimSpace(body.PetName)
	if petName == "" {
		jsonResponse(w, http.StatusBadRequest, errBody("pet name is required"))
		return
	}
	species := body.Species
	if species == "" {
		species = "dog"
	}
	if species != "dog" && species != "cat" && species != "other" {
		jsonResponse(w, http.StatusBadRequest, errBody("species must be dog, cat, or other"))
		return
	}
	tz := strings.TrimSpace(body.Timezone)
	if tz == "" {
		tz = "Asia/Singapore"
	}
	if !validTimezone(tz) {
		jsonResponse(w, http.StatusBadRequest, errBody("invalid timezone"))
		return
	}
	circle, pet, err := a.createCircleWithPet(req.Context(), userID, petName, species, strings.TrimSpace(body.Breed), tz)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not create circle"))
		return
	}
	jsonResponse(w, http.StatusCreated, map[string]any{"circle": circle, "pet": pet})
}

// createCircleWithPet inserts circle + owner membership + first pet in one tx.
// The circle name is derived from the pet name ("{pet}'s circle") since the
// contract's create payload has no circle name field.
func (a *app) createCircleWithPet(ctx context.Context, userID int64, petName, species, breed, tz string) (*circleJSON, *petJSON, error) {
	tx, err := a.pool.Begin(ctx)
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback(ctx)
	code := newInviteCode()
	var circleID int64
	err = tx.QueryRow(ctx,
		`INSERT INTO circles (name, timezone, invite_code, created_by)
		 VALUES ($1, $2, $3, $4) RETURNING id`,
		petName+"'s circle", tz, code, userID).Scan(&circleID)
	if err != nil {
		return nil, nil, err
	}
	if _, err = tx.Exec(ctx,
		`INSERT INTO circle_members (circle_id, user_id, role) VALUES ($1, $2, 'owner')`,
		circleID, userID); err != nil {
		return nil, nil, err
	}
	pet, err := insertPetRow(ctx, tx, circleID, userID, petName, species, breed)
	if err != nil {
		return nil, nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, nil, err
	}
	return &circleJSON{ID: circleID, Name: petName + "'s circle", Timezone: tz, InviteCode: &code}, pet, nil
}

func (a *app) handleJoinCircle(w http.ResponseWriter, req *http.Request, userID int64) {
	var body struct {
		InviteCode string `json:"invite_code"`
	}
	if err := readJSON(req, &body); err != nil {
		jsonResponse(w, http.StatusBadRequest, errBody("invalid request body"))
		return
	}
	code := strings.TrimSpace(body.InviteCode)
	if code == "" {
		jsonResponse(w, http.StatusBadRequest, errBody("invite code is required"))
		return
	}
	ctx := req.Context()
	var circleID int64
	var name, tz string
	err := a.pool.QueryRow(ctx,
		`SELECT id, name, timezone FROM circles WHERE invite_code = $1`, code,
	).Scan(&circleID, &name, &tz)
	if errors.Is(err, pgx.ErrNoRows) {
		jsonResponse(w, http.StatusNotFound, errBody("invite code not found"))
		return
	}
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not join circle"))
		return
	}
	// Plan gate: member count (owner included) vs the caller's plan quota.
	limits := a.limitsFor(ctx, userID)
	var memberCount int
	if err := a.pool.QueryRow(ctx,
		`SELECT count(*) FROM circle_members WHERE circle_id = $1`, circleID,
	).Scan(&memberCount); err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not join circle"))
		return
	}
	if memberCount >= limits.Members {
		jsonResponse(w, http.StatusForbidden, map[string]any{
			"error": "member limit reached", "limit": limits.Members,
		})
		return
	}
	tag, err := a.pool.Exec(ctx,
		`INSERT INTO circle_members (circle_id, user_id, role) VALUES ($1, $2, 'caregiver')
		 ON CONFLICT DO NOTHING`, circleID, userID)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not join circle"))
		return
	}
	if tag.RowsAffected() == 0 {
		jsonResponse(w, http.StatusConflict, errBody("already a member"))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]any{
		"circle": circleJSON{ID: circleID, Name: name, Timezone: tz, InviteCode: &code},
		"pet":    a.firstPetForCircle(ctx, circleID),
	})
}

// firstPetForCircle returns the circle's first pet (nil when none remain).
func (a *app) firstPetForCircle(ctx context.Context, circleID int64) *petJSON {
	pets, err := a.petsForCircle(ctx, circleID)
	if err != nil || len(pets) == 0 {
		return nil
	}
	return &pets[0]
}

func (a *app) handleGetCircle(w http.ResponseWriter, req *http.Request, userID, circleID int64, role string) {
	ctx := req.Context()
	var name, tz, code string
	err := a.pool.QueryRow(ctx,
		`SELECT name, timezone, invite_code FROM circles WHERE id = $1`, circleID,
	).Scan(&name, &tz, &code)
	if errors.Is(err, pgx.ErrNoRows) {
		jsonResponse(w, http.StatusNotFound, errBody("circle not found"))
		return
	}
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not load circle"))
		return
	}
	rows, err := a.pool.Query(ctx,
		`SELECT m.user_id, u.display_name, u.email, m.role, m.joined_at
		   FROM circle_members m JOIN users u ON u.id = m.user_id
		  WHERE m.circle_id = $1 ORDER BY m.joined_at, m.user_id`, circleID)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not load members"))
		return
	}
	defer rows.Close()
	members := []memberJSON{}
	for rows.Next() {
		var m memberJSON
		if err := rows.Scan(&m.UserID, &m.DisplayName, &m.Email, &m.Role, &m.JoinedAt); err != nil {
			jsonResponse(w, http.StatusInternalServerError, errBody("could not load members"))
			return
		}
		m.JoinedAt = m.JoinedAt.UTC()
		members = append(members, m)
	}
	if err := rows.Err(); err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not load members"))
		return
	}
	circle := circleJSON{ID: circleID, Name: name, Timezone: tz}
	if role == "owner" {
		circle.InviteCode = &code
	}
	jsonResponse(w, http.StatusOK, map[string]any{"circle": circle, "members": members})
}

func (a *app) handleRefreshInvite(w http.ResponseWriter, req *http.Request, userID, circleID int64) {
	var fresh string
	err := a.pool.QueryRow(req.Context(),
		`UPDATE circles SET invite_code = $2 WHERE id = $1 RETURNING invite_code`,
		circleID, newInviteCode()).Scan(&fresh)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not refresh invite code"))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]string{"invite_code": fresh})
}

func (a *app) handleRemoveMember(w http.ResponseWriter, req *http.Request, userID, circleID int64) {
	targetID, ok := pathID(req, "userID")
	if !ok {
		jsonResponse(w, http.StatusBadRequest, errBody("invalid user id"))
		return
	}
	if targetID == userID {
		jsonResponse(w, http.StatusBadRequest, errBody("owner cannot remove themselves"))
		return
	}
	tag, err := a.pool.Exec(req.Context(),
		`DELETE FROM circle_members WHERE circle_id = $1 AND user_id = $2`,
		circleID, targetID)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not remove member"))
		return
	}
	if tag.RowsAffected() == 0 {
		jsonResponse(w, http.StatusNotFound, errBody("member not found"))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *app) handlePatchCircle(w http.ResponseWriter, req *http.Request, userID, circleID int64) {
	var body struct {
		Name     *string `json:"name"`
		Timezone *string `json:"timezone"`
	}
	if err := readJSON(req, &body); err != nil {
		jsonResponse(w, http.StatusBadRequest, errBody("invalid request body"))
		return
	}
	if body.Name != nil {
		name := strings.TrimSpace(*body.Name)
		if name == "" {
			jsonResponse(w, http.StatusBadRequest, errBody("circle name cannot be empty"))
			return
		}
		body.Name = &name
	}
	if body.Timezone != nil {
		tz := strings.TrimSpace(*body.Timezone)
		if !validTimezone(tz) {
			jsonResponse(w, http.StatusBadRequest, errBody("invalid timezone"))
			return
		}
		body.Timezone = &tz
	}
	var name, tz, code string
	err := a.pool.QueryRow(req.Context(),
		`UPDATE circles SET name = COALESCE($2, name), timezone = COALESCE($3, timezone)
		 WHERE id = $1 RETURNING name, timezone, invite_code`,
		circleID, body.Name, body.Timezone).Scan(&name, &tz, &code)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not update circle"))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]any{
		"circle": circleJSON{ID: circleID, Name: name, Timezone: tz, InviteCode: &code},
	})
}
