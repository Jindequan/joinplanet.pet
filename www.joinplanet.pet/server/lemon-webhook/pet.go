package main

// pet.go — F3 宠物与用药: pet profile read/patch, medication lifecycle with
// automatic "Started"/"Stopped" timeline events. All log_date-style fields
// (started_on/ended_on) are resolved as "today" in the circle's timezone.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

func init() {
	apiModules = append(apiModules, func(mux *http.ServeMux, a *app) {
		mux.HandleFunc("GET /pets/{petID}", a.requirePetMember(a.handleGetPet))
		mux.HandleFunc("PATCH /pets/{petID}", a.requirePetMember(a.handlePatchPet))
		mux.HandleFunc("GET /pets/{petID}/medications", a.requirePetMember(a.handleListMedications))
		mux.HandleFunc("POST /pets/{petID}/medications", a.requirePetMember(a.handleCreateMedication))
		// /medications/{id} routes have no pet in the path: resolve pet_id from
		// the row, then authorize via circleRoleForPet (same root of trust).
		mux.HandleFunc("PATCH /medications/{medicationID}", a.requireAuth(a.handlePatchMedication))
		mux.HandleFunc("DELETE /medications/{medicationID}", a.requireAuth(a.handleDeleteMedication))
	})
}

// ---- pet shapes ----------------------------------------------------------------

type emergencyContactJSON struct {
	Name  string `json:"name"`
	Phone string `json:"phone"`
	Note  string `json:"note"`
}

type petJSON struct {
	ID                int64                            `json:"id"`
	Name              string                           `json:"name"`
	Species           string                           `json:"species"`
	Breed             string                           `json:"breed"`
	Birthday          *string                          `json:"birthday"`
	Allergies         []string                         `json:"allergies"`
	Conditions        []string                         `json:"conditions"`
	EmergencyContacts map[string]*emergencyContactJSON `json:"emergency_contacts"`
	Notes             string                           `json:"notes"`
	AvatarKey         *string                          `json:"avatar_key"`
}

type petRow struct {
	id                int64
	name              string
	species           string
	breed             string
	birthday          *time.Time
	allergies         []byte
	conditions        []byte
	emergencyContacts []byte
	notes             string
	avatarKey         *string
}

const petColumns = `id, name, species, breed, birthday, allergies, conditions, emergency_contacts, notes, avatar_key`

func (r *petRow) dest() []any {
	return []any{&r.id, &r.name, &r.species, &r.breed, &r.birthday,
		&r.allergies, &r.conditions, &r.emergencyContacts, &r.notes, &r.avatarKey}
}

func (r *petRow) toJSON() petJSON {
	p := petJSON{
		ID:                r.id,
		Name:              r.name,
		Species:           r.species,
		Breed:             r.breed,
		Allergies:         jsonStringArray(r.allergies),
		Conditions:        jsonStringArray(r.conditions),
		EmergencyContacts: jsonContacts(r.emergencyContacts),
		Notes:             r.notes,
		AvatarKey:         r.avatarKey,
	}
	if r.birthday != nil {
		day := r.birthday.Format("2006-01-02")
		p.Birthday = &day
	}
	return p
}

// insertPetRow creates the first pet of a new circle (called from circle.go).
func insertPetRow(ctx context.Context, q pgxQuerier, circleID, userID int64, name, species, breed string) (*petJSON, error) {
	var r petRow
	err := q.QueryRow(ctx,
		`INSERT INTO pets (circle_id, name, species, breed, created_by)
		 VALUES ($1, $2, $3, $4, $5) RETURNING `+petColumns,
		circleID, name, species, breed, userID).Scan(r.dest()...)
	if err != nil {
		return nil, err
	}
	p := r.toJSON()
	return &p, nil
}

func jsonStringArray(raw []byte) []string {
	values := []string{}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &values)
	}
	if values == nil {
		return []string{}
	}
	return values
}

// jsonContacts always returns all three canonical slots (null when unset).
func jsonContacts(raw []byte) map[string]*emergencyContactJSON {
	contacts := map[string]*emergencyContactJSON{}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &contacts)
	}
	for _, key := range []string{"primary", "vet", "authorized_decision_maker"} {
		if _, ok := contacts[key]; !ok {
			contacts[key] = nil
		}
	}
	return contacts
}

// ---- dynamic UPDATE builder ------------------------------------------------------

// sqlSets accumulates SET clauses + args for a partial (subset) UPDATE.
// Column names are always hardcoded by the caller, never user input.
type sqlSets struct {
	sets []string
	args []any
}

func (s *sqlSets) set(column string, value any) {
	s.sets = append(s.sets, fmt.Sprintf("%s = $%d", column, len(s.args)+1))
	s.args = append(s.args, value)
}

func (s *sqlSets) setDate(column, value string) {
	s.sets = append(s.sets, fmt.Sprintf("%s = $%d::date", column, len(s.args)+1))
	s.args = append(s.args, value)
}

func (s *sqlSets) setJSONB(column string, value any) {
	raw, _ := json.Marshal(value) // []string / map[string]*struct marshal cannot fail
	s.sets = append(s.sets, fmt.Sprintf("%s = $%d::jsonb", column, len(s.args)+1))
	s.args = append(s.args, raw)
}

// ---- pet handlers -----------------------------------------------------------------

func (a *app) handleGetPet(w http.ResponseWriter, req *http.Request, userID, petID int64, role string) {
	var r petRow
	err := a.pool.QueryRow(req.Context(),
		`SELECT `+petColumns+` FROM pets WHERE id = $1`, petID).Scan(r.dest()...)
	if errors.Is(err, pgx.ErrNoRows) {
		jsonResponse(w, http.StatusNotFound, errBody("pet not found"))
		return
	}
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not load pet"))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]any{"pet": r.toJSON()})
}

func (a *app) handlePatchPet(w http.ResponseWriter, req *http.Request, userID, petID int64, role string) {
	var body map[string]json.RawMessage
	if err := readJSON(req, &body); err != nil {
		jsonResponse(w, http.StatusBadRequest, errBody("invalid request body"))
		return
	}
	sets, err := petPatchSets(body)
	if err != nil {
		jsonResponse(w, http.StatusBadRequest, errBody(err.Error()))
		return
	}
	pet, err := a.applyPetPatch(req.Context(), petID, sets)
	if errors.Is(err, pgx.ErrNoRows) {
		jsonResponse(w, http.StatusNotFound, errBody("pet not found"))
		return
	}
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not update pet"))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]any{"pet": pet})
}

// applyPetPatch executes the partial UPDATE (or plain SELECT when the body
// carried no known fields) and returns the resulting pet.
func (a *app) applyPetPatch(ctx context.Context, petID int64, s *sqlSets) (*petJSON, error) {
	var r petRow
	var err error
	if len(s.sets) == 0 {
		err = a.pool.QueryRow(ctx,
			`SELECT `+petColumns+` FROM pets WHERE id = $1`, petID).Scan(r.dest()...)
	} else {
		args := append(s.args, petID)
		query := fmt.Sprintf(`UPDATE pets SET %s WHERE id = $%d RETURNING %s`,
			strings.Join(s.sets, ", "), len(args), petColumns)
		err = a.pool.QueryRow(ctx, query, args...).Scan(r.dest()...)
	}
	if err != nil {
		return nil, err
	}
	p := r.toJSON()
	return &p, nil
}

// petPatchSets turns a partial pet body into SET clauses; unknown keys ignored.
func petPatchSets(body map[string]json.RawMessage) (*sqlSets, error) {
	s := &sqlSets{}
	if err := patchPetText(s, body, "name", "name", true); err != nil {
		return nil, err
	}
	if raw, ok := body["species"]; ok {
		var v string
		if json.Unmarshal(raw, &v) != nil || (v != "dog" && v != "cat" && v != "other") {
			return nil, errors.New("species must be dog, cat, or other")
		}
		s.set("species", v)
	}
	if err := patchPetText(s, body, "breed", "breed", false); err != nil {
		return nil, err
	}
	if err := patchPetText(s, body, "notes", "notes", false); err != nil {
		return nil, err
	}
	if err := patchPetBirthday(s, body); err != nil {
		return nil, err
	}
	if err := patchPetArray(s, body, "allergies"); err != nil {
		return nil, err
	}
	if err := patchPetArray(s, body, "conditions"); err != nil {
		return nil, err
	}
	if err := patchPetContacts(s, body); err != nil {
		return nil, err
	}
	if err := patchPetAvatarKey(s, body); err != nil {
		return nil, err
	}
	return s, nil
}

func patchPetText(s *sqlSets, body map[string]json.RawMessage, key, column string, required bool) error {
	raw, ok := body[key]
	if !ok {
		return nil
	}
	var v string
	if json.Unmarshal(raw, &v) != nil {
		return fmt.Errorf("%s must be a string", key)
	}
	v = strings.TrimSpace(v)
	if required && v == "" {
		return errors.New("pet name cannot be empty")
	}
	s.set(column, v)
	return nil
}

func patchPetBirthday(s *sqlSets, body map[string]json.RawMessage) error {
	raw, ok := body["birthday"]
	if !ok {
		return nil
	}
	var v *string
	if json.Unmarshal(raw, &v) != nil {
		return errors.New("birthday must be a date or null")
	}
	if v == nil {
		s.set("birthday", nil)
		return nil
	}
	day := strings.TrimSpace(*v)
	if _, err := time.Parse("2006-01-02", day); err != nil {
		return errors.New("birthday must be YYYY-MM-DD")
	}
	s.setDate("birthday", day)
	return nil
}

func patchPetArray(s *sqlSets, body map[string]json.RawMessage, key string) error {
	raw, ok := body[key]
	if !ok {
		return nil
	}
	values, err := decodeStringArray(raw, key)
	if err != nil {
		return err
	}
	s.setJSONB(key, values)
	return nil
}

func patchPetContacts(s *sqlSets, body map[string]json.RawMessage) error {
	raw, ok := body["emergency_contacts"]
	if !ok {
		return nil
	}
	contacts, err := decodeContacts(raw)
	if err != nil {
		return err
	}
	s.setJSONB("emergency_contacts", contacts)
	return nil
}

func patchPetAvatarKey(s *sqlSets, body map[string]json.RawMessage) error {
	raw, ok := body["avatar_key"]
	if !ok {
		return nil
	}
	var v *string
	if json.Unmarshal(raw, &v) != nil {
		return errors.New("avatar_key must be a string or null")
	}
	if v != nil {
		trimmed := strings.TrimSpace(*v)
		v = &trimmed
	}
	s.set("avatar_key", v)
	return nil
}

func decodeStringArray(raw json.RawMessage, field string) ([]string, error) {
	var values []string
	if err := json.Unmarshal(raw, &values); err != nil {
		return nil, fmt.Errorf("%s must be an array of strings", field)
	}
	out := make([]string, 0, len(values))
	for _, v := range values {
		if v = strings.TrimSpace(v); v != "" {
			out = append(out, v)
		}
	}
	return out, nil
}

// decodeContacts keeps only the three canonical slots, trimming each field.
func decodeContacts(raw json.RawMessage) (map[string]*emergencyContactJSON, error) {
	var in map[string]*emergencyContactJSON
	if json.Unmarshal(raw, &in) != nil {
		return nil, errors.New("emergency_contacts must be an object")
	}
	out := map[string]*emergencyContactJSON{}
	for _, key := range []string{"primary", "vet", "authorized_decision_maker"} {
		out[key] = trimContact(in[key])
	}
	return out, nil
}

func trimContact(c *emergencyContactJSON) *emergencyContactJSON {
	if c == nil {
		return nil
	}
	return &emergencyContactJSON{
		Name:  strings.TrimSpace(c.Name),
		Phone: strings.TrimSpace(c.Phone),
		Note:  strings.TrimSpace(c.Note),
	}
}

// ---- medication shapes -----------------------------------------------------------

type medicationJSON struct {
	ID        int64   `json:"id"`
	Name      string  `json:"name"`
	Dose      string  `json:"dose"`
	Schedule  string  `json:"schedule"`
	Note      string  `json:"note"`
	Active    bool    `json:"active"`
	StartedOn string  `json:"started_on"`
	EndedOn   *string `json:"ended_on"`
}

type medRow struct {
	id        int64
	petID     int64
	name      string
	dose      string
	schedule  string
	note      string
	active    bool
	startedOn time.Time
	endedOn   *time.Time
}

const medColumns = `id, pet_id, name, dose, schedule, note, active, started_on, ended_on`

func (m *medRow) dest() []any {
	return []any{&m.id, &m.petID, &m.name, &m.dose, &m.schedule, &m.note,
		&m.active, &m.startedOn, &m.endedOn}
}

func (m *medRow) toJSON() medicationJSON {
	j := medicationJSON{
		ID: m.id, Name: m.name, Dose: m.dose, Schedule: m.schedule, Note: m.note,
		Active: m.active, StartedOn: m.startedOn.Format("2006-01-02"),
	}
	if m.endedOn != nil {
		day := m.endedOn.Format("2006-01-02")
		j.EndedOn = &day
	}
	return j
}

// medEventJSON is the timeline-event shape for auto-generated medication events.
type medEventJSON struct {
	ID          int64          `json:"id"`
	Type        string         `json:"type"`
	OccurredAt  time.Time      `json:"occurred_at"`
	Title       string         `json:"title"`
	Body        string         `json:"body"`
	Severity    *string        `json:"severity"`
	Data        map[string]any `json:"data"`
	RecordedBy  int64          `json:"recorded_by"`
	ByName      string         `json:"by_name"`
	Source      string         `json:"source"`
	Attachments []any          `json:"attachments"`
}

// ---- medication handlers ------------------------------------------------------------

func (a *app) handleListMedications(w http.ResponseWriter, req *http.Request, userID, petID int64, role string) {
	rows, err := a.pool.Query(req.Context(),
		`SELECT `+medColumns+` FROM medications WHERE pet_id = $1
		 ORDER BY active DESC, COALESCE(ended_on, started_on) DESC, id DESC`, petID)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not load medications"))
		return
	}
	defer rows.Close()
	active, past := []medicationJSON{}, []medicationJSON{}
	for rows.Next() {
		var m medRow
		if err := rows.Scan(m.dest()...); err != nil {
			jsonResponse(w, http.StatusInternalServerError, errBody("could not load medications"))
			return
		}
		if m.active {
			active = append(active, m.toJSON())
		} else {
			past = append(past, m.toJSON())
		}
	}
	if err := rows.Err(); err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not load medications"))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]any{"active": active, "past": past})
}

func (a *app) handleCreateMedication(w http.ResponseWriter, req *http.Request, userID, petID int64, role string) {
	var body struct {
		Name     string `json:"name"`
		Dose     string `json:"dose"`
		Schedule string `json:"schedule"`
		Note     string `json:"note"`
	}
	if err := readJSON(req, &body); err != nil {
		jsonResponse(w, http.StatusBadRequest, errBody("invalid request body"))
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		jsonResponse(w, http.StatusBadRequest, errBody("medication name is required"))
		return
	}
	ctx := req.Context()
	tz, err := a.petCircleTimezone(ctx, petID)
	if err != nil {
		jsonResponse(w, http.StatusNotFound, errBody("pet not found"))
		return
	}
	med, event, err := a.createMedication(ctx, userID, petID, tz, a.userNameByID(ctx, userID),
		name, strings.TrimSpace(body.Dose), strings.TrimSpace(body.Schedule), strings.TrimSpace(body.Note))
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not create medication"))
		return
	}
	jsonResponse(w, http.StatusCreated, map[string]any{"medication": med, "event": event})
}

// petCircleTimezone resolves the timezone of the circle owning this pet.
func (a *app) petCircleTimezone(ctx context.Context, petID int64) (string, error) {
	var tz string
	err := a.pool.QueryRow(ctx,
		`SELECT c.timezone FROM pets p JOIN circles c ON c.id = p.circle_id WHERE p.id = $1`,
		petID).Scan(&tz)
	return tz, err
}

func (a *app) userNameByID(ctx context.Context, userID int64) string {
	var name string
	if err := a.pool.QueryRow(ctx, `SELECT display_name FROM users WHERE id = $1`, userID).Scan(&name); err != nil {
		return ""
	}
	return name
}

// createMedication inserts an active medication (started_on = circle-local
// today) plus its "Started" timeline event in one transaction.
func (a *app) createMedication(ctx context.Context, userID, petID int64, tz, byName, name, dose, schedule, note string) (*medicationJSON, *medEventJSON, error) {
	tx, err := a.pool.Begin(ctx)
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback(ctx)
	var m medRow
	err = tx.QueryRow(ctx,
		`INSERT INTO medications (pet_id, name, dose, schedule, note, started_on, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6::date, $7) RETURNING `+medColumns,
		petID, name, dose, schedule, note, circleTodayDate(tz), userID).Scan(m.dest()...)
	if err != nil {
		return nil, nil, err
	}
	event, err := insertMedEvent(ctx, tx, petID, m.id, userID, byName, "Started "+name, doseScheduleBody(dose, schedule))
	if err != nil {
		return nil, nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, nil, err
	}
	med := m.toJSON()
	return &med, event, nil
}

// insertMedEvent writes a system-sourced medication timeline event.
func insertMedEvent(ctx context.Context, tx pgx.Tx, petID, medID, userID int64, byName, title, body string) (*medEventJSON, error) {
	var e medEventJSON
	err := tx.QueryRow(ctx,
		`INSERT INTO timeline_events (pet_id, type, title, body, source, medication_id, recorded_by)
		 VALUES ($1, 'medication', $2, $3, 'system', $4, $5)
		 RETURNING id, occurred_at, title, body`,
		petID, title, body, medID, userID).Scan(&e.ID, &e.OccurredAt, &e.Title, &e.Body)
	if err != nil {
		return nil, err
	}
	e.Type = "medication"
	e.OccurredAt = e.OccurredAt.UTC()
	e.Data = map[string]any{}
	e.RecordedBy = userID
	e.ByName = byName
	e.Source = "system"
	e.Attachments = []any{}
	return &e, nil
}

// doseScheduleBody joins dose and schedule as "{dose} · {schedule}", skipping empties.
func doseScheduleBody(dose, schedule string) string {
	parts := make([]string, 0, 2)
	if dose != "" {
		parts = append(parts, dose)
	}
	if schedule != "" {
		parts = append(parts, schedule)
	}
	return strings.Join(parts, " · ")
}

func (a *app) handlePatchMedication(w http.ResponseWriter, req *http.Request, userID int64) {
	medID, ok := pathID(req, "medicationID")
	if !ok {
		jsonResponse(w, http.StatusBadRequest, errBody("invalid medication id"))
		return
	}
	ctx := req.Context()
	current, tz, err := a.loadMedication(ctx, medID)
	if err != nil {
		jsonResponse(w, http.StatusNotFound, errBody("medication not found"))
		return
	}
	if _, _, err := a.circleRoleForPet(ctx, current.petID, userID); err != nil {
		jsonResponse(w, http.StatusNotFound, errBody("medication not found"))
		return
	}
	var body map[string]json.RawMessage
	if err := readJSON(req, &body); err != nil {
		jsonResponse(w, http.StatusBadRequest, errBody("invalid request body"))
		return
	}
	sets, stop, err := medPatchSets(body, current.active, tz)
	if err != nil {
		jsonResponse(w, http.StatusBadRequest, errBody(err.Error()))
		return
	}
	if len(sets.sets) == 0 {
		jsonResponse(w, http.StatusOK, map[string]any{"medication": current.toJSON()})
		return
	}
	med, err := a.applyMedicationPatch(ctx, medID, userID, current, sets, stop, a.userNameByID(ctx, userID))
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not update medication"))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]any{"medication": med})
}

// medPatchSets builds the UPDATE for a medication patch; stop reports an
// active→inactive transition (which also writes a "Stopped" event). Re-asserting
// active=false on an already-inactive row keeps the original ended_on.
func medPatchSets(body map[string]json.RawMessage, currentlyActive bool, tz string) (*sqlSets, bool, error) {
	s := &sqlSets{}
	for _, field := range []string{"dose", "schedule", "note"} {
		raw, ok := body[field]
		if !ok {
			continue
		}
		var v string
		if json.Unmarshal(raw, &v) != nil {
			return nil, false, fmt.Errorf("%s must be a string", field)
		}
		s.set(field, strings.TrimSpace(v))
	}
	stop := false
	if raw, ok := body["active"]; ok {
		var v bool
		if json.Unmarshal(raw, &v) != nil {
			return nil, false, errors.New("active must be a boolean")
		}
		switch {
		case v:
			s.sets = append(s.sets, "active = TRUE", "ended_on = NULL")
		case currentlyActive:
			s.sets = append(s.sets, "active = FALSE")
			s.setDate("ended_on", circleTodayDate(tz))
			stop = true
		default:
			s.sets = append(s.sets, "active = FALSE")
		}
	}
	return s, stop, nil
}

// loadMedication fetches a medication row plus its circle timezone.
func (a *app) loadMedication(ctx context.Context, medID int64) (*medRow, string, error) {
	var m medRow
	var tz string
	err := a.pool.QueryRow(ctx,
		`SELECT m.id, m.pet_id, m.name, m.dose, m.schedule, m.note, m.active, m.started_on, m.ended_on, c.timezone
		   FROM medications m JOIN pets p ON p.id = m.pet_id JOIN circles c ON c.id = p.circle_id
		  WHERE m.id = $1`, medID).Scan(append(m.dest(), &tz)...)
	if err != nil {
		return nil, "", err
	}
	return &m, tz, nil
}

// applyMedicationPatch updates a medication and, on active→inactive, writes
// the "Stopped {name}" event in the same transaction.
func (a *app) applyMedicationPatch(ctx context.Context, medID, userID int64, current *medRow, s *sqlSets, stop bool, byName string) (*medicationJSON, error) {
	tx, err := a.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	args := append(s.args, medID)
	query := fmt.Sprintf(`UPDATE medications SET %s WHERE id = $%d RETURNING %s`,
		strings.Join(s.sets, ", "), len(args), medColumns)
	var m medRow
	if err := tx.QueryRow(ctx, query, args...).Scan(m.dest()...); err != nil {
		return nil, err
	}
	if stop {
		if _, err := insertMedEvent(ctx, tx, current.petID, medID, userID, byName, "Stopped "+current.name, ""); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	med := m.toJSON()
	return &med, nil
}

func (a *app) handleDeleteMedication(w http.ResponseWriter, req *http.Request, userID int64) {
	medID, ok := pathID(req, "medicationID")
	if !ok {
		jsonResponse(w, http.StatusBadRequest, errBody("invalid medication id"))
		return
	}
	ctx := req.Context()
	current, _, err := a.loadMedication(ctx, medID)
	if err != nil {
		jsonResponse(w, http.StatusNotFound, errBody("medication not found"))
		return
	}
	role, _, err := a.circleRoleForPet(ctx, current.petID, userID)
	if err != nil {
		jsonResponse(w, http.StatusNotFound, errBody("medication not found"))
		return
	}
	if role != "owner" {
		jsonResponse(w, http.StatusForbidden, errBody("owner only"))
		return
	}
	if err := a.deleteMedication(ctx, medID); err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not delete medication"))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]bool{"ok": true})
}

// deleteMedication hard-deletes the medication and cascades its (system-
// generated) timeline events in one transaction, per contract F3.
func (a *app) deleteMedication(ctx context.Context, medID int64) error {
	tx, err := a.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `DELETE FROM timeline_events WHERE medication_id = $1`, medID); err != nil {
		return err
	}
	tag, err := tx.Exec(ctx, `DELETE FROM medications WHERE id = $1`, medID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return tx.Commit(ctx)
}
