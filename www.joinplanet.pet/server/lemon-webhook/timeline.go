package main

// timeline.go — F5 健康时间线: cursor-paginated event feed (occurred_at DESC,
// UI spec §72) plus manual event CRUD. Daily task completions never enter the
// timeline (APP-DESIGN §"Today 与 Timeline 的数据边界"); only explicitly
// recorded events and system-generated medical events live here.

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

var timelineEventTypes = map[string]bool{
	"symptom": true, "weight": true, "medication": true,
	"vaccine": true, "visit": true, "note": true, "photo": true,
}

var timelineSeverities = map[string]bool{"mild": true, "moderate": true, "severe": true}

const timelineMaxLimit = 100

func init() {
	apiModules = append(apiModules, func(mux *http.ServeMux, a *app) {
		mux.HandleFunc("GET /pets/{petID}/timeline", a.requirePetMember(a.handleTimelineList))
		mux.HandleFunc("POST /pets/{petID}/events", a.requirePetMember(a.handleEventCreate))
		mux.HandleFunc("PATCH /events/{eventID}", a.requireAuth(a.handleEventUpdate))
		mux.HandleFunc("DELETE /events/{eventID}", a.requireAuth(a.handleEventDelete))
	})
}

// ---- JSON shapes -----------------------------------------------------------

type attachmentJSON struct {
	ID       int64  `json:"id"`
	Kind     string `json:"kind"`
	URL      string `json:"url"`
	Filename string `json:"filename"`
}

type eventJSON struct {
	ID          int64            `json:"id"`
	Type        string           `json:"type"`
	OccurredAt  string           `json:"occurred_at"`
	Title       string           `json:"title"`
	Body        string           `json:"body"`
	Severity    *string          `json:"severity"`
	Data        json.RawMessage  `json:"data"`
	RecordedBy  int64            `json:"recorded_by"`
	ByName      string           `json:"by_name"`
	Source      string           `json:"source"`
	Attachments []attachmentJSON `json:"attachments"`
}

const timelineEventColumns = `e.id, e.type, e.occurred_at, e.title, e.body, e.severity, e.data,
	       e.recorded_by, coalesce(u.display_name, ''), e.source`

// ---- GET /pets/{petID}/timeline ----------------------------------------------

func (a *app) handleTimelineList(w http.ResponseWriter, req *http.Request, _ int64, petID int64, _ string) {
	q := req.URL.Query()
	limit := 30
	if v := q.Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 {
			jsonResponse(w, http.StatusBadRequest, errBody("limit must be a positive number"))
			return
		}
		if n > timelineMaxLimit {
			n = timelineMaxLimit
		}
		limit = n
	}
	sqlText := `SELECT ` + timelineEventColumns + `
	  FROM timeline_events e
	  LEFT JOIN users u ON u.id = e.recorded_by
	 WHERE e.pet_id = $1`
	args := []any{petID}
	if before := strings.TrimSpace(q.Get("before")); before != "" {
		id, at, ok := a.timelineCursorAt(req.Context(), before, petID)
		if !ok {
			jsonResponse(w, http.StatusBadRequest, errBody("invalid before cursor"))
			return
		}
		args = append(args, at, id)
		sqlText += fmt.Sprintf(" AND (e.occurred_at, e.id) < ($%d, $%d)", len(args)-1, len(args))
	}
	if types := timelineTypesFilter(q.Get("types")); len(types) > 0 {
		args = append(args, types)
		sqlText += fmt.Sprintf(" AND e.type = ANY($%d)", len(args))
	}
	args = append(args, limit+1) // fetch one extra to detect a next page
	sqlText += fmt.Sprintf(" ORDER BY e.occurred_at DESC, e.id DESC LIMIT $%d", len(args))

	events, err := a.timelineQuery(req.Context(), sqlText, args)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not load timeline"))
		return
	}
	var next *string
	if len(events) > limit {
		events = events[:limit]
		last := strconv.FormatInt(events[len(events)-1].ID, 10)
		next = &last
	}
	if err := a.attachFiles(req.Context(), req, events); err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not load attachments"))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]any{"events": events, "next_cursor": next})
}

// timelineCursorAt resolves a before-cursor event id to its (id, occurred_at)
// position within this pet's timeline.
func (a *app) timelineCursorAt(ctx context.Context, raw string, petID int64) (int64, time.Time, bool) {
	id, err := strconv.ParseInt(strings.TrimSpace(raw), 10, 64)
	if err != nil || id <= 0 {
		return 0, time.Time{}, false
	}
	var at time.Time
	err = a.pool.QueryRow(ctx,
		`SELECT occurred_at FROM timeline_events WHERE id = $1 AND pet_id = $2`, id, petID).Scan(&at)
	if err != nil {
		return 0, time.Time{}, false
	}
	return id, at, true
}

// timelineTypesFilter keeps only known event types from a comma-separated list.
func timelineTypesFilter(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	var out []string
	for _, t := range strings.Split(raw, ",") {
		if t = strings.ToLower(strings.TrimSpace(t)); t != "" && timelineEventTypes[t] {
			out = append(out, t)
		}
	}
	return out
}

func (a *app) timelineQuery(ctx context.Context, sqlText string, args []any) ([]eventJSON, error) {
	rows, err := a.pool.Query(ctx, sqlText, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	events := []eventJSON{}
	for rows.Next() {
		e, err := scanTimelineEvent(rows.Scan)
		if err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	return events, rows.Err()
}

// scanTimelineEvent reads the shared event column list into its JSON shape.
func scanTimelineEvent(scan func(dest ...any) error) (eventJSON, error) {
	var e eventJSON
	var occurred time.Time
	var severity *string
	var data []byte
	if err := scan(&e.ID, &e.Type, &occurred, &e.Title, &e.Body,
		&severity, &data, &e.RecordedBy, &e.ByName, &e.Source); err != nil {
		return e, err
	}
	e.OccurredAt = occurred.UTC().Format(time.RFC3339)
	e.Severity = severity
	if len(data) == 0 {
		data = []byte("{}")
	}
	e.Data = json.RawMessage(data)
	e.Attachments = []attachmentJSON{}
	return e, nil
}

// attachFiles joins attachments for the fetched events and builds absolute
// public file URLs against the requesting host.
func (a *app) attachFiles(ctx context.Context, req *http.Request, events []eventJSON) error {
	if len(events) == 0 {
		return nil
	}
	ids := make([]int64, len(events))
	for i, e := range events {
		ids[i] = e.ID
	}
	rows, err := a.pool.Query(ctx,
		`SELECT event_id, id, kind, storage_key, filename
		   FROM attachments WHERE event_id = ANY($1) ORDER BY id`, ids)
	if err != nil {
		return err
	}
	defer rows.Close()
	byEvent := map[int64][]attachmentJSON{}
	for rows.Next() {
		var eventID int64
		var att attachmentJSON
		var key string
		if err := rows.Scan(&eventID, &att.ID, &att.Kind, &key, &att.Filename); err != nil {
			return err
		}
		att.URL = fileURLFor(req, key)
		byEvent[eventID] = append(byEvent[eventID], att)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for i := range events {
		if atts := byEvent[events[i].ID]; atts != nil {
			events[i].Attachments = atts
		}
	}
	return nil
}

// ---- POST /pets/{petID}/events -------------------------------------------------

func (a *app) handleEventCreate(w http.ResponseWriter, req *http.Request, userID, petID int64, _ string) {
	var body struct {
		Type       string          `json:"type"`
		Title      string          `json:"title"`
		Body       string          `json:"body"`
		OccurredAt string          `json:"occurred_at"`
		Severity   string          `json:"severity"`
		Data       json.RawMessage `json:"data"`
	}
	if err := readJSON(req, &body); err != nil {
		jsonResponse(w, http.StatusBadRequest, errBody("invalid request body"))
		return
	}
	eventType := strings.TrimSpace(body.Type)
	if !timelineEventTypes[eventType] {
		jsonResponse(w, http.StatusBadRequest, errBody("invalid event type"))
		return
	}
	title := truncate(strings.TrimSpace(body.Title), 200)
	if title == "" {
		jsonResponse(w, http.StatusBadRequest, errBody("title is required"))
		return
	}
	severity := strings.TrimSpace(body.Severity)
	if severity != "" && !timelineSeverities[severity] {
		jsonResponse(w, http.StatusBadRequest, errBody("severity must be mild, moderate or severe"))
		return
	}
	occurred := time.Now().UTC()
	if v := strings.TrimSpace(body.OccurredAt); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			jsonResponse(w, http.StatusBadRequest, errBody("occurred_at must be an RFC3339 timestamp"))
			return
		}
		occurred = t.UTC()
	}
	data, dataErr := normalizeEventData(eventType, body.Data)
	if dataErr != "" {
		jsonResponse(w, http.StatusBadRequest, errBody(dataErr))
		return
	}
	var sev any
	if severity != "" {
		sev = severity
	}
	event, err := a.createTimelineEvent(req.Context(), petID, eventType, title,
		truncate(strings.TrimSpace(body.Body), 5000), occurred, sev, data, userID)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not save event"))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]any{"event": event})
}

// normalizeEventData validates the structured payload; weight events must
// carry a numeric data.weight_kg > 0 (API contract F5).
func normalizeEventData(eventType string, raw json.RawMessage) (json.RawMessage, string) {
	if len(raw) == 0 || string(raw) == "null" {
		if eventType == "weight" {
			return nil, "weight events require data.weight_kg"
		}
		return json.RawMessage("{}"), ""
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil || m == nil {
		return nil, "data must be a JSON object"
	}
	if eventType == "weight" {
		kg, ok := m["weight_kg"].(float64)
		if !ok || kg <= 0 {
			return nil, "data.weight_kg must be a number greater than zero"
		}
	}
	out, err := json.Marshal(m)
	if err != nil {
		return nil, "data must be a JSON object"
	}
	return out, ""
}

func (a *app) createTimelineEvent(ctx context.Context, petID int64, eventType, title, body string, occurred time.Time, severity any, data json.RawMessage, userID int64) (eventJSON, error) {
	row := a.pool.QueryRow(ctx, `
		WITH ins AS (
			INSERT INTO timeline_events (pet_id, type, occurred_at, title, body, severity, data, recorded_by, source)
			VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, 'manual')
			RETURNING id, type, occurred_at, title, body, severity, data, recorded_by, source
		)
		SELECT `+timelineEventColumns+`
		  FROM ins e
		  LEFT JOIN users u ON u.id = e.recorded_by`,
		petID, eventType, occurred, title, body, severity, []byte(data), userID)
	return scanTimelineEvent(row.Scan)
}

// ---- PATCH/DELETE /events/{eventID} ---------------------------------------------

// timelineEventPet loads the owning pet and the recorder of an event.
func (a *app) timelineEventPet(ctx context.Context, eventID int64) (petID, recordedBy int64, ok bool) {
	err := a.pool.QueryRow(ctx,
		`SELECT pet_id, recorded_by FROM timeline_events WHERE id = $1`, eventID).Scan(&petID, &recordedBy)
	if err != nil {
		return 0, 0, false
	}
	return petID, recordedBy, true
}

// eventRecorderOrOwner guards event mutations: the member who recorded it, or
// the circle owner. Writes the error response itself; ok=false means return.
func (a *app) eventRecorderOrOwner(w http.ResponseWriter, req *http.Request, userID int64) (int64, bool) {
	eventID, valid := pathID(req, "eventID")
	if !valid {
		jsonResponse(w, http.StatusBadRequest, errBody("invalid event id"))
		return 0, false
	}
	petID, recordedBy, found := a.timelineEventPet(req.Context(), eventID)
	if !found {
		jsonResponse(w, http.StatusNotFound, errBody("event not found"))
		return 0, false
	}
	role, _, err := a.circleRoleForPet(req.Context(), petID, userID)
	if err != nil {
		jsonResponse(w, http.StatusNotFound, errBody("event not found"))
		return 0, false
	}
	if recordedBy != userID && role != "owner" {
		jsonResponse(w, http.StatusForbidden, errBody("only the recorder or owner can modify this event"))
		return 0, false
	}
	return eventID, true
}

func (a *app) handleEventUpdate(w http.ResponseWriter, req *http.Request, userID int64) {
	eventID, ok := a.eventRecorderOrOwner(w, req, userID)
	if !ok {
		return
	}
	var body struct {
		Title      *string         `json:"title"`
		Body       *string         `json:"body"`
		OccurredAt *string         `json:"occurred_at"`
		Severity   *string         `json:"severity"`
		Data       json.RawMessage `json:"data"`
	}
	if err := readJSON(req, &body); err != nil {
		jsonResponse(w, http.StatusBadRequest, errBody("invalid request body"))
		return
	}
	var title, bodyText, sev, dataVal any
	var occurred *time.Time
	if body.Title != nil {
		v := truncate(strings.TrimSpace(*body.Title), 200)
		if v == "" {
			jsonResponse(w, http.StatusBadRequest, errBody("title cannot be empty"))
			return
		}
		title = v
	}
	if body.Body != nil {
		bodyText = truncate(strings.TrimSpace(*body.Body), 5000)
	}
	if body.OccurredAt != nil {
		t, err := time.Parse(time.RFC3339, strings.TrimSpace(*body.OccurredAt))
		if err != nil {
			jsonResponse(w, http.StatusBadRequest, errBody("occurred_at must be an RFC3339 timestamp"))
			return
		}
		occurred = &t
	}
	sevSet := body.Severity != nil
	if sevSet {
		v := strings.TrimSpace(*body.Severity)
		if v == "" {
			sev = nil // explicit clear
		} else if !timelineSeverities[v] {
			jsonResponse(w, http.StatusBadRequest, errBody("severity must be mild, moderate or severe"))
			return
		} else {
			sev = v
		}
	}
	if len(body.Data) > 0 && string(body.Data) != "null" {
		var m map[string]any
		if err := json.Unmarshal(body.Data, &m); err != nil || m == nil {
			jsonResponse(w, http.StatusBadRequest, errBody("data must be a JSON object"))
			return
		}
		out, _ := json.Marshal(m)
		dataVal = out
	}
	event, err := a.updateTimelineEvent(req.Context(), eventID, title, bodyText, occurred, sevSet, sev, dataVal)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not update event"))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]any{"event": event})
}

func (a *app) updateTimelineEvent(ctx context.Context, eventID int64, title, bodyText any, occurred *time.Time, sevSet bool, sev, dataVal any) (eventJSON, error) {
	row := a.pool.QueryRow(ctx, `
		WITH upd AS (
			UPDATE timeline_events SET
				title = COALESCE($1, title),
				body = COALESCE($2, body),
				occurred_at = COALESCE($3, occurred_at),
				severity = CASE WHEN $4 THEN $5::text ELSE severity END,
				data = COALESCE($6::jsonb, data)
			WHERE id = $7
			RETURNING id, type, occurred_at, title, body, severity, data, recorded_by, source
		)
		SELECT `+timelineEventColumns+`
		  FROM upd e
		  LEFT JOIN users u ON u.id = e.recorded_by`,
		title, bodyText, occurred, sevSet, sev, dataVal, eventID)
	return scanTimelineEvent(row.Scan)
}

func (a *app) handleEventDelete(w http.ResponseWriter, req *http.Request, userID int64) {
	eventID, ok := a.eventRecorderOrOwner(w, req, userID)
	if !ok {
		return
	}
	if _, err := a.pool.Exec(req.Context(),
		`DELETE FROM timeline_events WHERE id = $1`, eventID); err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not delete event"))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]bool{"ok": true})
}
