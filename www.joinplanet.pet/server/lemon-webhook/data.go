package main

// data.go — F8 数据生命周期：
//   GET    /pets/{petID}/export  全量 JSON 导出（owner 或 member）
//   DELETE /pets/{petID}         owner 硬删（FK 级联 + 空圈清理）
//   DELETE /me                   注销（级联 sessions；唯一 owner 先 409）
// 契约：docs/product/API-CONTRACT.md F8；删除策略见 APP-DESIGN §3.3（用户可见对象硬删）。

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

const dataFKViolation = "23503" // foreign_key_violation

func init() {
	apiModules = append(apiModules, func(mux *http.ServeMux, a *app) {
		mux.HandleFunc("GET /pets/{petID}/export", a.requirePetMember(a.handleExportPet))
		mux.HandleFunc("DELETE /pets/{petID}", a.requirePetOwner(a.handleDeletePet))
		mux.HandleFunc("DELETE /me", a.requireAuth(a.handleDeleteMe))
	})
}

// ---- 导出 --------------------------------------------------------------------

func (a *app) handleExportPet(w http.ResponseWriter, req *http.Request, _, petID int64, _ string) {
	ctx := req.Context()
	pet, err := a.dataQueryOne(ctx, `
		SELECT id, circle_id, name, species, breed,
		       to_char(birthday, 'YYYY-MM-DD') AS birthday,
		       allergies, conditions, emergency_contacts, notes, avatar_key,
		       created_by, created_at
		  FROM pets WHERE id = $1`, petID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonResponse(w, http.StatusNotFound, errBody("pet not found"))
			return
		}
		jsonResponse(w, http.StatusInternalServerError, errBody("could not load pet"))
		return
	}
	meds, err := a.dataQueryMaps(ctx, `
		SELECT id, name, dose, schedule, note, active,
		       to_char(started_on, 'YYYY-MM-DD') AS started_on,
		       to_char(ended_on,  'YYYY-MM-DD') AS ended_on,
		       created_by, created_at
		  FROM medications WHERE pet_id = $1 ORDER BY started_on, id`, petID)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not export medications"))
		return
	}
	tasks, err := a.dataQueryMaps(ctx, `
		SELECT id, to_char(time_of_day, 'HH24:MI') AS time_of_day,
		       repeat, note, active, created_by, created_at
		  FROM care_tasks WHERE pet_id = $1 ORDER BY time_of_day, id`, petID)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not export care tasks"))
		return
	}
	logs, events, attachments, err := a.exportHistory(ctx, petID)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not export history"))
		return
	}
	now := time.Now().UTC()
	name, _ := pet["name"].(string)
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition",
		`attachment; filename="`+dataExportFilename(name, now)+`"`)
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"exported_at":     now,
		"pet":             pet,
		"medications":     meds,
		"care_tasks":      tasks,
		"task_logs":       logs,
		"timeline_events": events,
		"attachments":     attachments,
	})
}

func (a *app) exportHistory(ctx context.Context, petID int64) ([]map[string]any, []map[string]any, []map[string]any, error) {
	logs, err := a.dataQueryMaps(ctx, `
		SELECT l.id, l.task_id, to_char(l.log_date, 'YYYY-MM-DD') AS log_date,
		       l.status, l.by_user_id, l.at, l.note
		  FROM task_logs l JOIN care_tasks t ON t.id = l.task_id
		 WHERE t.pet_id = $1 AND l.log_date >= CURRENT_DATE - 90
		 ORDER BY l.log_date DESC, l.at DESC`, petID)
	if err != nil {
		return nil, nil, nil, err
	}
	events, err := a.dataQueryMaps(ctx, `
		SELECT id, type, occurred_at, title, body, severity, data,
		       medication_id, recorded_by, source, created_at
		  FROM timeline_events WHERE pet_id = $1
		 ORDER BY occurred_at DESC, id DESC`, petID)
	if err != nil {
		return nil, nil, nil, err
	}
	attachments, err := a.dataQueryMaps(ctx, `
		SELECT id, event_id, kind, storage_key, filename, size,
		       uploaded_by, created_at
		  FROM attachments WHERE pet_id = $1 ORDER BY created_at, id`, petID)
	if err != nil {
		return nil, nil, nil, err
	}
	for _, m := range attachments {
		if key, _ := m["storage_key"].(string); key != "" {
			m["url"] = "/api/v1/files/" + key // 随机 key 即权限（契约 F5）
		}
	}
	return logs, events, attachments, nil
}

// ---- 宠物删除 ------------------------------------------------------------------

func (a *app) handleDeletePet(w http.ResponseWriter, req *http.Request, _, petID int64) {
	ctx := req.Context()
	var circleID int64
	if err := a.pool.QueryRow(ctx,
		`SELECT circle_id FROM pets WHERE id = $1`, petID).Scan(&circleID); err != nil {
		jsonResponse(w, http.StatusNotFound, errBody("pet not found"))
		return
	}
	tx, err := a.pool.Begin(ctx)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not delete pet"))
		return
	}
	defer tx.Rollback(ctx)
	// tasks/logs/events/attachments/shares 经 FK ON DELETE CASCADE 一并硬删。
	if _, err := tx.Exec(ctx, `DELETE FROM pets WHERE id = $1`, petID); err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not delete pet"))
		return
	}
	// 圈子再无宠物则一并删除（F2：circle = 一个宠物家庭）。
	if _, err := tx.Exec(ctx,
		`DELETE FROM circles WHERE id = $1
		  AND NOT EXISTS (SELECT 1 FROM pets WHERE circle_id = $1)`, circleID); err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not delete pet"))
		return
	}
	if err := tx.Commit(ctx); err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not delete pet"))
		return
	}
	// TODO(data): uploads/ 下的文件 blob 暂不随 pet 删除（attachments 行已级联，
	// 孤儿文件清理作为后续运维任务，避免误删仍被其他记录引用的 key）。
	jsonResponse(w, http.StatusOK, map[string]bool{"ok": true})
}

// ---- 注销 --------------------------------------------------------------------

func (a *app) handleDeleteMe(w http.ResponseWriter, req *http.Request, userID int64) {
	ctx := req.Context()
	var blockedCircle int64
	err := a.pool.QueryRow(ctx, `
		SELECT c.id FROM circles c
		 JOIN circle_members m ON m.circle_id = c.id AND m.user_id = $1 AND m.role = 'owner'
		WHERE NOT EXISTS (
			SELECT 1 FROM circle_members o
			 WHERE o.circle_id = c.id AND o.role = 'owner' AND o.user_id <> $1)
		LIMIT 1`, userID).Scan(&blockedCircle)
	if err == nil {
		jsonResponse(w, http.StatusConflict, errBody("transfer ownership or delete the pet first"))
		return
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not delete account"))
		return
	}
	// sessions / entitlements / circle_members 随 users ON DELETE CASCADE 级联。
	tag, err := a.pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == dataFKViolation {
			// 仍是其他记录的 created_by/recorded_by（如共同 owner 圈子的建立者）。
			jsonResponse(w, http.StatusConflict, errBody("transfer ownership or delete the pet first"))
			return
		}
		jsonResponse(w, http.StatusInternalServerError, errBody("could not delete account"))
		return
	}
	if tag.RowsAffected() == 0 {
		jsonResponse(w, http.StatusNotFound, errBody("user not found"))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]bool{"ok": true})
}

// ---- 查询小工具 ----------------------------------------------------------------

// dataQueryMaps 返回字段名 → 值 的行列表；jsonb 转为 json.RawMessage 以原样输出。
func (a *app) dataQueryMaps(ctx context.Context, query string, args ...any) ([]map[string]any, error) {
	rows, err := a.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		values, err := rows.Values()
		if err != nil {
			return nil, err
		}
		descs := rows.FieldDescriptions()
		m := make(map[string]any, len(descs))
		for i, d := range descs {
			v := values[i]
			if b, ok := v.([]byte); ok {
				v = json.RawMessage(b) // 避免 []byte 被编码成 base64
			}
			m[string(d.Name)] = v
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (a *app) dataQueryOne(ctx context.Context, query string, args ...any) (map[string]any, error) {
	rows, err := a.dataQueryMaps(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, pgx.ErrNoRows
	}
	return rows[0], nil
}

// dataExportFilename — "planet-milo-20260816.json"（名字仅保留 a-z0-9，分隔 -）。
func dataExportFilename(petName string, now time.Time) string {
	var b strings.Builder
	lastDash := false
	for _, r := range strings.ToLower(petName) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			lastDash = false
		default:
			if !lastDash {
				b.WriteByte('-')
				lastDash = true
			}
		}
	}
	slug := strings.Trim(b.String(), "-")
	if slug == "" {
		slug = "pet"
	}
	return fmt.Sprintf("planet-%s-%s.json", slug, now.Format("20060102"))
}
