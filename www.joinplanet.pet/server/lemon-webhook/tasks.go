package main

// tasks.go — F4 今日照护: today view, care-task CRUD, and the daily log.
// log_date is a circle-local calendar date (APP-DESIGN §3.3); timestamps are
// stored UTC. Concurrent completions of the same task on the same day are
// reconciled, not overwritten: the second writer gets 409 + the authoritative
// existing log and silently adopts it (UI spec §71 — "server returns the
// authoritative record").

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

func init() {
	apiModules = append(apiModules, func(mux *http.ServeMux, a *app) {
		mux.HandleFunc("GET /pets/{petID}/today", a.requirePetMember(a.handleTodayList))
		mux.HandleFunc("POST /pets/{petID}/tasks", a.requirePetMember(a.handleTaskCreate))
		mux.HandleFunc("PATCH /tasks/{taskID}", a.requireAuth(a.handleTaskUpdate))
		mux.HandleFunc("DELETE /tasks/{taskID}", a.requireAuth(a.handleTaskDelete))
		mux.HandleFunc("POST /tasks/{taskID}/log", a.requireAuth(a.handleTaskLogUpsert))
		mux.HandleFunc("DELETE /tasks/{taskID}/log", a.requireAuth(a.handleTaskLogDelete))
	})
}

// ---- JSON shapes -----------------------------------------------------------

type taskLogJSON struct {
	Status   string `json:"status"`
	ByUserID int64  `json:"by_user_id"`
	ByName   string `json:"by_name"`
	At       string `json:"at"`
	Note     string `json:"note"`
	LogDate  string `json:"log_date"`
}

type taskJSON struct {
	ID           int64        `json:"id"`
	Title        string       `json:"title"`
	TimeOfDay    string       `json:"time_of_day"`
	Note         string       `json:"note"`
	Active       bool         `json:"active"`
	MedicationID *int64       `json:"medication_id"`
	Log          *taskLogJSON `json:"log"`
}

// errTaskLogConflict marks an upsert that hit another member's existing log.
var errTaskLogConflict = errors.New("task log already recorded by another member")

// ---- taskID-scoped guard ---------------------------------------------------

// resolveTask loads the task's pet and the caller's circle role, writing the
// error response itself. ok=false means the caller must return immediately.
func (a *app) resolveTask(w http.ResponseWriter, req *http.Request, userID int64) (taskID, petID int64, role string, ok bool) {
	taskID, valid := pathID(req, "taskID")
	if !valid {
		jsonResponse(w, http.StatusBadRequest, errBody("invalid task id"))
		return 0, 0, "", false
	}
	if err := a.pool.QueryRow(req.Context(),
		`SELECT pet_id FROM care_tasks WHERE id = $1`, taskID).Scan(&petID); err != nil {
		jsonResponse(w, http.StatusNotFound, errBody("task not found"))
		return 0, 0, "", false
	}
	role, _, err := a.circleRoleForPet(req.Context(), petID, userID)
	if err != nil {
		jsonResponse(w, http.StatusNotFound, errBody("task not found"))
		return 0, 0, "", false
	}
	return taskID, petID, role, true
}

// ---- GET /pets/{petID}/today ------------------------------------------------

func (a *app) handleTodayList(w http.ResponseWriter, req *http.Request, _ int64, petID int64, _ string) {
	date := req.URL.Query().Get("date")
	if date == "" {
		var err error
		if date, err = a.taskCircleToday(req.Context(), petID); err != nil {
			jsonResponse(w, http.StatusInternalServerError, errBody("could not load today"))
			return
		}
	}
	if _, ok := parseLogDate(date); !ok {
		jsonResponse(w, http.StatusBadRequest, errBody("date must be YYYY-MM-DD"))
		return
	}
	tasks, err := a.listTodayTasks(req.Context(), petID, date)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not load tasks"))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]any{"date": date, "tasks": tasks})
}

// taskCircleToday returns today's date (YYYY-MM-DD) in the circle timezone
// owning this pet, falling back to UTC for unknown zone names.
func (a *app) taskCircleToday(ctx context.Context, petID int64) (string, error) {
	var tz string
	if err := a.pool.QueryRow(ctx,
		`SELECT c.timezone FROM pets p JOIN circles c ON c.id = p.circle_id WHERE p.id = $1`,
		petID).Scan(&tz); err != nil {
		return "", err
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc = time.UTC
	}
	return time.Now().In(loc).Format("2006-01-02"), nil
}

func (a *app) listTodayTasks(ctx context.Context, petID int64, date string) ([]taskJSON, error) {
	rows, err := a.pool.Query(ctx, `
		SELECT t.id, t.title, to_char(t.time_of_day, 'HH24:MI'), t.note, t.medication_id,
		       l.status, l.by_user_id, u.display_name, l.at, l.note, l.log_date
		  FROM care_tasks t
		  LEFT JOIN task_logs l ON l.task_id = t.id AND l.log_date = $2::date
		  LEFT JOIN users u ON u.id = l.by_user_id
		 WHERE t.pet_id = $1 AND t.active
		 ORDER BY t.time_of_day, t.id`, petID, date)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	tasks := []taskJSON{}
	for rows.Next() {
		var t taskJSON
		var status, byName, logNote *string
		var byUserID *int64
		var at, logDate *time.Time
		if err := rows.Scan(&t.ID, &t.Title, &t.TimeOfDay, &t.Note, &t.MedicationID,
			&status, &byUserID, &byName, &logNote, &at, &logDate); err != nil {
			return nil, err
		}
		t.Active = true
		t.Log = taskLogFromRow(status, byUserID, byName, logNote, at, logDate)
		tasks = append(tasks, t)
	}
	return tasks, rows.Err()
}

// taskLogFromRow assembles a log object from nullable scan targets; nil when
// the day has no log yet.
func taskLogFromRow(status *string, byUserID *int64, byName, logNote *string, at, logDate *time.Time) *taskLogJSON {
	if status == nil || byUserID == nil {
		return nil
	}
	log := &taskLogJSON{Status: *status, ByUserID: *byUserID}
	if byName != nil {
		log.ByName = *byName
	}
	if logNote != nil {
		log.Note = *logNote
	}
	if at != nil {
		log.At = at.UTC().Format(time.RFC3339)
	}
	if logDate != nil {
		log.LogDate = logDate.Format("2006-01-02")
	}
	return log
}

// ---- POST /pets/{petID}/tasks -----------------------------------------------

func (a *app) handleTaskCreate(w http.ResponseWriter, req *http.Request, userID, petID int64, _ string) {
	var body struct {
		Title        string `json:"title"`
		TimeOfDay    string `json:"time_of_day"`
		Note         string `json:"note"`
		MedicationID *int64 `json:"medication_id"`
	}
	if err := readJSON(req, &body); err != nil {
		jsonResponse(w, http.StatusBadRequest, errBody("invalid request body"))
		return
	}
	title := truncate(strings.TrimSpace(body.Title), 200)
	if title == "" {
		jsonResponse(w, http.StatusBadRequest, errBody("title is required"))
		return
	}
	tod := strings.TrimSpace(body.TimeOfDay)
	if tod == "" {
		tod = "08:00"
	}
	if !validTimeOfDay(tod) {
		jsonResponse(w, http.StatusBadRequest, errBody("time_of_day must be HH:MM"))
		return
	}
	var task taskJSON
	err := a.pool.QueryRow(req.Context(), `
		INSERT INTO care_tasks (circle_id, pet_id, title, time_of_day, note, medication_id, created_by)
		VALUES ((SELECT circle_id FROM pets WHERE id = $1), $1, $2, $3::time, $4, $5, $6)
		RETURNING id, title, to_char(time_of_day, 'HH24:MI'), note, medication_id, active`,
		petID, title, tod, truncate(strings.TrimSpace(body.Note), 2000), body.MedicationID, userID,
	).Scan(&task.ID, &task.Title, &task.TimeOfDay, &task.Note, &task.MedicationID, &task.Active)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not create task"))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]any{"task": task})
}

func validTimeOfDay(s string) bool {
	if len(s) != 5 {
		return false
	}
	_, err := time.Parse("15:04", s)
	return err == nil
}

// ---- PATCH/DELETE /tasks/{taskID} --------------------------------------------

func (a *app) handleTaskUpdate(w http.ResponseWriter, req *http.Request, userID int64) {
	taskID, _, _, ok := a.resolveTask(w, req, userID)
	if !ok {
		return
	}
	var body struct {
		Title     *string `json:"title"`
		TimeOfDay *string `json:"time_of_day"`
		Note      *string `json:"note"`
		Active    *bool   `json:"active"`
	}
	if err := readJSON(req, &body); err != nil {
		jsonResponse(w, http.StatusBadRequest, errBody("invalid request body"))
		return
	}
	var title, tod, note any
	var active any
	if body.Title != nil {
		v := truncate(strings.TrimSpace(*body.Title), 200)
		if v == "" {
			jsonResponse(w, http.StatusBadRequest, errBody("title cannot be empty"))
			return
		}
		title = v
	}
	if body.TimeOfDay != nil {
		v := strings.TrimSpace(*body.TimeOfDay)
		if !validTimeOfDay(v) {
			jsonResponse(w, http.StatusBadRequest, errBody("time_of_day must be HH:MM"))
			return
		}
		tod = v
	}
	if body.Note != nil {
		note = truncate(strings.TrimSpace(*body.Note), 2000)
	}
	if body.Active != nil {
		active = *body.Active
	}
	var task taskJSON
	err := a.pool.QueryRow(req.Context(), `
		UPDATE care_tasks SET
			title = COALESCE($1, title),
			time_of_day = COALESCE($2::time, time_of_day),
			note = COALESCE($3, note),
			active = COALESCE($4, active)
		WHERE id = $5
		RETURNING id, title, to_char(time_of_day, 'HH24:MI'), note, active`,
		title, tod, note, active, taskID,
	).Scan(&task.ID, &task.Title, &task.TimeOfDay, &task.Note, &task.Active)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not update task"))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]any{"task": task})
}

func (a *app) handleTaskDelete(w http.ResponseWriter, req *http.Request, userID int64) {
	taskID, _, role, ok := a.resolveTask(w, req, userID)
	if !ok {
		return
	}
	if role != "owner" {
		jsonResponse(w, http.StatusForbidden, errBody("owner only"))
		return
	}
	if _, err := a.pool.Exec(req.Context(),
		`DELETE FROM care_tasks WHERE id = $1`, taskID); err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not delete task"))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]bool{"ok": true})
}

// ---- POST /tasks/{taskID}/log (upsert with reconciliation) --------------------

func (a *app) handleTaskLogUpsert(w http.ResponseWriter, req *http.Request, userID int64) {
	taskID, petID, _, ok := a.resolveTask(w, req, userID)
	if !ok {
		return
	}
	var body struct {
		Status string `json:"status"`
		Note   string `json:"note"`
		Date   string `json:"date"`
	}
	if err := readJSON(req, &body); err != nil {
		jsonResponse(w, http.StatusBadRequest, errBody("invalid request body"))
		return
	}
	if body.Status != "done" && body.Status != "skipped" {
		jsonResponse(w, http.StatusBadRequest, errBody("status must be done or skipped"))
		return
	}
	date := body.Date
	if date == "" {
		var err error
		if date, err = a.taskCircleToday(req.Context(), petID); err != nil {
			jsonResponse(w, http.StatusInternalServerError, errBody("could not save log"))
			return
		}
	}
	if _, valid := parseLogDate(date); !valid {
		jsonResponse(w, http.StatusBadRequest, errBody("date must be YYYY-MM-DD"))
		return
	}
	log, err := a.upsertTaskLog(req.Context(), taskID, date, body.Status, userID,
		truncate(strings.TrimSpace(body.Note), 2000))
	if errors.Is(err, errTaskLogConflict) {
		a.respondLogConflict(w, req, taskID, date)
		return
	}
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not save log"))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]any{"log": log})
}

// respondLogConflict returns 409 with the authoritative log so the app can
// silently adopt it (API contract F4 / UI spec §71) instead of surfacing an error.
func (a *app) respondLogConflict(w http.ResponseWriter, req *http.Request, taskID int64, date string) {
	body := map[string]any{"error": "already logged by another member"}
	if existing, err := a.taskLogFor(req.Context(), taskID, date); err == nil {
		body["log"] = existing
	}
	jsonResponse(w, http.StatusConflict, body)
}

// upsertTaskLog writes today's (or the given date's) log. The DO UPDATE guard
// only lets the same member overwrite their own log (e.g. done → skipped);
// another member's log is left untouched and reported as a conflict.
func (a *app) upsertTaskLog(ctx context.Context, taskID int64, date, status string, userID int64, note string) (*taskLogJSON, error) {
	var log taskLogJSON
	var at, logDate time.Time
	err := a.pool.QueryRow(ctx, `
		WITH upserted AS (
			INSERT INTO task_logs (task_id, log_date, status, by_user_id, note)
			VALUES ($1, $2::date, $3, $4, $5)
			ON CONFLICT (task_id, log_date) DO UPDATE
				SET status = EXCLUDED.status, note = EXCLUDED.note,
				    by_user_id = EXCLUDED.by_user_id, at = now()
				WHERE task_logs.by_user_id = EXCLUDED.by_user_id
			RETURNING id, log_date, status, by_user_id, at, note
		)
		SELECT u.status, u.by_user_id, coalesce(us.display_name, ''), u.at, u.note, u.log_date
		  FROM upserted u
		  LEFT JOIN users us ON us.id = u.by_user_id`,
		taskID, date, status, userID, note,
	).Scan(&log.Status, &log.ByUserID, &log.ByName, &at, &log.Note, &logDate)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errTaskLogConflict
	}
	if err != nil {
		return nil, err
	}
	log.At = at.UTC().Format(time.RFC3339)
	log.LogDate = logDate.Format("2006-01-02")
	return &log, nil
}

func (a *app) taskLogFor(ctx context.Context, taskID int64, date string) (*taskLogJSON, error) {
	var log taskLogJSON
	var at, logDate time.Time
	err := a.pool.QueryRow(ctx, `
		SELECT l.status, l.by_user_id, coalesce(u.display_name, ''), l.at, l.note, l.log_date
		  FROM task_logs l
		  LEFT JOIN users u ON u.id = l.by_user_id
		 WHERE l.task_id = $1 AND l.log_date = $2::date`,
		taskID, date,
	).Scan(&log.Status, &log.ByUserID, &log.ByName, &at, &log.Note, &logDate)
	if err != nil {
		return nil, err
	}
	log.At = at.UTC().Format(time.RFC3339)
	log.LogDate = logDate.Format("2006-01-02")
	return &log, nil
}

// ---- DELETE /tasks/{taskID}/log?date= (undo) ----------------------------------

func (a *app) handleTaskLogDelete(w http.ResponseWriter, req *http.Request, userID int64) {
	taskID, petID, _, ok := a.resolveTask(w, req, userID)
	if !ok {
		return
	}
	date := req.URL.Query().Get("date")
	if date == "" {
		var err error
		if date, err = a.taskCircleToday(req.Context(), petID); err != nil {
			jsonResponse(w, http.StatusInternalServerError, errBody("could not undo log"))
			return
		}
	}
	if _, valid := parseLogDate(date); !valid {
		jsonResponse(w, http.StatusBadRequest, errBody("date must be YYYY-MM-DD"))
		return
	}
	if _, err := a.pool.Exec(req.Context(),
		`DELETE FROM task_logs WHERE task_id = $1 AND log_date = $2::date`, taskID, date); err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not undo log"))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]bool{"ok": true})
}

// ---- small helpers ------------------------------------------------------------

// parseLogDate validates a strict YYYY-MM-DD calendar date.
func parseLogDate(s string) (string, bool) {
	if len(s) != 10 {
		return "", false
	}
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return "", false
	}
	return t.Format("2006-01-02"), true
}
