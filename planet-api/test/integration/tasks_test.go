package integration

import (
	"context"
	"net/http"
	"sync"
	"testing"
	"time"
)

func TestTodayAndCompletion(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, familyID, petID := e.SetupFamily("tk", "Milo")

	mk := func(title, schedJSON string) string {
		r := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok,
			`{"title":"`+title+`","schedule":`+schedJSON+`}`)
		if r.Status != http.StatusCreated {
			t.Fatalf("mk task %s: %d %v", title, r.Status, r.Body)
		}
		return r.Body["task"].(map[string]any)["id"].(string)
	}
	dailyID := mk("喂药", `{"v":1,"kind":"daily"}`)
	_ = mk("每周称重", `{"v":1,"kind":"weekly","days":[1]}`)       // 周一
	_ = mk("每 3 天梳毛", `{"v":1,"kind":"interval","every_n":3}`) // 创建日为第 0 天 → 今天排程

	today := e.Do("GET", "/api/v1/families/"+familyID+"/today", ownerTok, nil)
	if today.Status != http.StatusOK {
		t.Fatalf("today: %d %v", today.Status, today.Body)
	}
	titles := map[string]any{}
	for _, pg := range today.Body["pets"].([]any) {
		for _, item := range pg.(map[string]any)["items"].([]any) {
			task := item.(map[string]any)["task"].(map[string]any)
			titles[task["title"].(string)] = item.(map[string]any)["log"]
		}
	}
	// daily 与 interval(今天=第0天) 必在；weekly 视当天星期而定，不硬断言
	if _, ok := titles["喂药"]; !ok {
		t.Fatalf("daily task missing from today: %v", titles)
	}
	if _, ok := titles["每 3 天梳毛"]; !ok {
		t.Fatalf("interval day-0 task missing: %v", titles)
	}

	// 完成 → 201；重复 → 409 + 权威 log
	c1 := e.Do("POST", "/api/v1/tasks/"+dailyID+"/logs", ownerTok, map[string]any{"status": "done"})
	if c1.Status != http.StatusCreated {
		t.Fatalf("complete: %d %v", c1.Status, c1.Body)
	}
	c2 := e.Do("POST", "/api/v1/tasks/"+dailyID+"/logs", ownerTok, map[string]any{"status": "done"})
	if c2.Status != http.StatusConflict || e.ErrorCode(c2) != "TASK_LOG_EXISTS" {
		t.Fatalf("dup complete: %d %v", c2.Status, c2.Body)
	}
	if c2.Log == nil || c2.Log["id"] != c1.Body["log"].(map[string]any)["id"] {
		t.Fatalf("409 must carry authoritative log: %v", c2.Body)
	}

	// 未来日期拒绝；>7 天补记拒绝
	future := e.Do("POST", "/api/v1/tasks/"+dailyID+"/logs", ownerTok, map[string]any{"date": "2030-01-01"})
	if future.Status != http.StatusBadRequest {
		t.Fatalf("future date: %d", future.Status)
	}
	old := e.Do("POST", "/api/v1/tasks/"+dailyID+"/logs", ownerTok, map[string]any{"date": "2026-08-01"})
	if old.Status != http.StatusBadRequest {
		t.Fatalf("backfill >7d: %d", old.Status)
	}

	// undo 后可重完成
	logID := c1.Body["log"].(map[string]any)["id"].(string)
	if r := e.Do("POST", "/api/v1/task-logs/"+logID+"/undo", ownerTok, nil); r.Status != http.StatusNoContent {
		t.Fatalf("undo: %d %v", r.Status, r.Body)
	}
	undoneTimeline := e.Do("GET", "/api/v1/timeline?pet_id="+petID, ownerTok, nil)
	if undoneTimeline.Status != http.StatusOK {
		t.Fatalf("timeline after undo: %d %v", undoneTimeline.Status, undoneTimeline.Body)
	}
	undoneEvents := undoneTimeline.Body["events"].([]any)
	if len(undoneEvents) == 0 {
		t.Fatal("undo must leave an immutable timeline fact")
	}
	undone := undoneEvents[0].(map[string]any)
	if undone["type"] != "care_task_undone" || undone["care_occurrence_id"] != dailyID {
		t.Fatalf("undo timeline fact must link to the same occurrence: %v", undone)
	}
	c3 := e.Do("POST", "/api/v1/tasks/"+dailyID+"/logs", ownerTok, map[string]any{"status": "skipped"})
	if c3.Status != http.StatusCreated {
		t.Fatalf("re-complete after undo: %d %v", c3.Status, c3.Body)
	}
	// A lost 204 response must be replayable without creating a second undo fact.
	c3LogID := c3.Body["log"].(map[string]any)["id"].(string)
	undoKey := "undo-replay-test-001"
	if r := e.doWithHeader("POST", "/api/v1/task-logs/"+c3LogID+"/undo", ownerTok, nil, undoKey); r.Status != http.StatusNoContent {
		t.Fatalf("idempotent undo: %d %v", r.Status, r.Body)
	}
	if r := e.doWithHeader("POST", "/api/v1/task-logs/"+c3LogID+"/undo", ownerTok, nil, undoKey); r.Status != http.StatusNoContent {
		t.Fatalf("idempotent undo replay: %d %v", r.Status, r.Body)
	}
	ownerLogForRoleTest := e.Do("POST", "/api/v1/tasks/"+dailyID+"/logs", ownerTok, map[string]any{"status": "done"})
	if ownerLogForRoleTest.Status != http.StatusCreated {
		t.Fatalf("re-complete after idempotent undo: %d %v", ownerLogForRoleTest.Status, ownerLogForRoleTest.Body)
	}

	// 未被分配的 caregiver 不能执行；owner 分配后才可执行。
	cgTok, cgID, _ := e.NewUser("tk-cg")
	ri := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	e.Do("POST", "/api/v1/families/join", cgTok, map[string]any{"code": ri.Body["invite_code"]})
	nr := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok,
		`{"title":"遛狗","schedule":{"v":1,"kind":"daily"}}`)
	walkID := nr.Body["task"].(map[string]any)["id"].(string)
	if r := e.Do("POST", "/api/v1/tasks/"+walkID+"/logs", cgTok, map[string]any{"status": "done"}); r.Status != http.StatusForbidden {
		t.Fatalf("unassigned caregiver must not complete: %d %v", r.Status, r.Body)
	}
	if r := e.Do("PUT", "/api/v1/care-plans/"+walkID+"/assignments/"+cgID, ownerTok, map[string]any{"role": "helper"}); r.Status != http.StatusOK {
		t.Fatalf("assign caregiver: %d %v", r.Status, r.Body)
	}
	cg := e.Do("POST", "/api/v1/tasks/"+walkID+"/logs", cgTok, map[string]any{"status": "done"})
	if cg.Status != http.StatusCreated {
		t.Fatalf("caregiver complete: %d %v", cg.Status, cg.Body)
	}
	// caregiver 不能 undo owner 的记录
	ownerLog := ownerLogForRoleTest.Body["log"].(map[string]any)["id"].(string)
	if r := e.Do("POST", "/api/v1/task-logs/"+ownerLog+"/undo", cgTok, nil); r.Status != http.StatusForbidden {
		t.Fatalf("cg undo owner log: %d", r.Status)
	}
	// caregiver 不能删任务
	if r := e.Do("DELETE", "/api/v1/tasks/"+walkID, cgTok, nil); r.Status != http.StatusForbidden {
		t.Fatalf("cg delete task: %d", r.Status)
	}
	_ = cgID
}

func TestCareAssignmentFallbackOrderCanMove(t *testing.T) {
	e := NewEnv(t)
	if _, err := e.Pool.Exec(context.Background(), `UPDATE plans SET members=3 WHERE key='free'`); err != nil {
		t.Fatalf("expand test member quota: %v", err)
	}
	ownerTok, _, familyID, petID := e.SetupFamily("assignment-order", "Milo")
	firstTok, firstID, _ := e.NewUser("assignment-order-first")
	secondTok, secondID, _ := e.NewUser("assignment-order-second")
	invite := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	if r := e.Do("POST", "/api/v1/families/join", firstTok, map[string]any{"code": invite.Body["invite_code"]}); r.Status != http.StatusOK {
		t.Fatalf("first member join: %d %v", r.Status, r.Body)
	}
	invite = e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	if r := e.Do("POST", "/api/v1/families/join", secondTok, map[string]any{"code": invite.Body["invite_code"]}); r.Status != http.StatusOK {
		t.Fatalf("second member join: %d %v", r.Status, r.Body)
	}
	created := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok,
		`{"title":"顺序测试","schedule":{"v":1,"kind":"daily"}}`)
	if created.Status != http.StatusCreated {
		t.Fatalf("create care plan: %d %v", created.Status, created.Body)
	}
	planID := created.Body["task"].(map[string]any)["id"].(string)
	for _, member := range []struct {
		token string
		id    string
		key   string
	}{{firstTok, firstID, "assignment-order-first"}, {secondTok, secondID, "assignment-order-second"}} {
		if r := e.Do("PUT", "/api/v1/care-plans/"+planID+"/assignments/"+member.id, ownerTok, map[string]any{"role": "helper"}); r.Status != http.StatusOK {
			t.Fatalf("assign %s: %d %v", member.key, r.Status, r.Body)
		}
	}
	list := e.Do("GET", "/api/v1/care-plans/"+planID+"/assignments", ownerTok, nil)
	if list.Status != http.StatusOK {
		t.Fatalf("list assignments: %d %v", list.Status, list.Body)
	}
	items := list.Body["assignments"].([]any)
	if len(items) != 3 || items[1].(map[string]any)["user_id"] != firstID || items[2].(map[string]any)["user_id"] != secondID {
		t.Fatalf("initial fallback order: %v", list.Body)
	}
	moved := e.DoJSON("POST", "/api/v1/care-plans/"+planID+"/assignments/"+secondID+"/move", ownerTok, `{"direction":"up"}`)
	if moved.Status != http.StatusOK {
		t.Fatalf("move second helper up: %d %v", moved.Status, moved.Body)
	}
	list = e.Do("GET", "/api/v1/care-plans/"+planID+"/assignments", ownerTok, nil)
	items = list.Body["assignments"].([]any)
	if items[1].(map[string]any)["user_id"] != secondID || items[2].(map[string]any)["user_id"] != firstID {
		t.Fatalf("moved fallback order: %v", list.Body)
	}
	if invalid := e.DoJSON("POST", "/api/v1/care-plans/"+planID+"/assignments/"+secondID+"/move", ownerTok, `{"direction":"sideways"}`); invalid.Status != http.StatusBadRequest {
		t.Fatalf("invalid move direction: %d %v", invalid.Status, invalid.Body)
	}
}

func TestFamilyOwnerManagesFamilyCarePlanWithoutPetOwnership(t *testing.T) {
	e := NewEnv(t)
	petOwnerTok, petOwnerID, sourceFamilyID, petID := e.SetupFamily("family-care-owner-pet", "Milo")
	familyOwnerTok, _, targetFamilyID, _ := e.SetupFamily("family-care-owner", "Coco")

	// The Pet owner joins the second Family so the shared Pet can be linked;
	// ownership of the Pet remains with the first user.
	invite := e.Do("POST", "/api/v1/families/"+targetFamilyID+"/invite/refresh", familyOwnerTok, nil)
	if invite.Status != http.StatusOK {
		t.Fatalf("refresh target invite: %d %v", invite.Status, invite.Body)
	}
	if joined := e.Do("POST", "/api/v1/families/join", petOwnerTok, map[string]any{"code": invite.Body["invite_code"]}); joined.Status != http.StatusOK {
		t.Fatalf("pet owner join target family: %d %v", joined.Status, joined.Body)
	}
	if linked := e.Do("POST", "/api/v1/pets/"+petID+"/families", petOwnerTok, map[string]any{"family_id": targetFamilyID}); linked.Status < 200 || linked.Status > 299 {
		t.Fatalf("link pet to target family: %d %v", linked.Status, linked.Body)
	}

	created := e.DoJSON("POST", "/api/v1/pets/"+petID+"/care-plans", familyOwnerTok,
		`{"family_id":"`+targetFamilyID+`","type":"feeding","title":"家庭晚餐","rule":{"type":"daily","time":"18:30"}}`)
	if created.Status != http.StatusCreated {
		t.Fatalf("family owner create plan: %d %v", created.Status, created.Body)
	}
	planID := created.Body["care_plan"].(map[string]any)["id"].(string)

	updated := e.Do("PATCH", "/api/v1/care-plans/"+planID, familyOwnerTok, map[string]any{"title": "家庭晚餐（调整）"})
	if updated.Status != http.StatusOK {
		t.Fatalf("family owner update plan: %d %v", updated.Status, updated.Body)
	}
	assigned := e.Do("GET", "/api/v1/care-plans/"+planID+"/assignments?family_id="+targetFamilyID, familyOwnerTok, nil)
	if assigned.Status != http.StatusOK {
		t.Fatalf("family owner list assignments: %d %v", assigned.Status, assigned.Body)
	}
	if helper := e.Do("PUT", "/api/v1/care-plans/"+planID+"/assignments/"+petOwnerID, familyOwnerTok, map[string]any{"role": "helper"}); helper.Status != http.StatusOK {
		t.Fatalf("family owner set helper: %d %v", helper.Status, helper.Body)
	}

	// Pet ownership remains a valid management path even when the plan belongs
	// to another Family.
	if retained := e.Do("PATCH", "/api/v1/care-plans/"+planID, petOwnerTok, map[string]any{"title": "宠物所有者仍可管理"}); retained.Status != http.StatusOK {
		t.Fatalf("pet owner should retain plan management: %d %v", retained.Status, retained.Body)
	}
	_ = sourceFamilyID
}

func TestDeleteCarePlanArchivesAndPreservesHistory(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, _, petID := e.SetupFamily("archive-care", "Milo")
	taskR := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok,
		`{"title":"喂药","schedule":{"v":1,"kind":"daily"}}`)
	if taskR.Status != http.StatusCreated {
		t.Fatalf("create care plan: %d %v", taskR.Status, taskR.Body)
	}
	taskID := taskR.Body["task"].(map[string]any)["id"].(string)
	if r := e.Do("POST", "/api/v1/tasks/"+taskID+"/logs", ownerTok, map[string]any{"status": "done"}); r.Status != http.StatusCreated {
		t.Fatalf("complete care plan: %d %v", r.Status, r.Body)
	}
	if r := e.Do("DELETE", "/api/v1/tasks/"+taskID, ownerTok, nil); r.Status != http.StatusNoContent {
		t.Fatalf("archive care plan through DELETE: %d %v", r.Status, r.Body)
	}
	var logCount int
	if err := e.Pool.QueryRow(context.Background(), `SELECT COUNT(*) FROM care_occurrences WHERE id = $1 AND status = 'completed'`, taskID).Scan(&logCount); err != nil {
		t.Fatalf("count preserved care history: %v", err)
	}
	if logCount != 1 {
		t.Fatalf("archiving care plan must preserve completed history, got %d logs", logCount)
	}
	if r := e.Do("GET", "/api/v1/pets/"+petID+"/tasks", ownerTok, nil); r.Status != http.StatusOK || len(r.Body["tasks"].([]any)) != 0 {
		t.Fatalf("archived care plan must leave active list: %d %v", r.Status, r.Body)
	}
}

func TestArchivedPetBlocksWritesAndToday(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, familyID, petID := e.SetupFamily("ar", "Milo")
	e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok, `{"title":"喂食","schedule":{"v":1,"kind":"daily"}}`)

	// 归档后：建任务/完成/建事件全部 PET_ARCHIVED
	if r := e.Do("POST", "/api/v1/pets/"+petID+"/archive", ownerTok, nil); r.Status != http.StatusOK {
		t.Fatalf("archive: %d", r.Status)
	}
	taskR := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok, `{"title":"新任务","schedule":{"v":1,"kind":"daily"}}`)
	if taskR.Status != http.StatusConflict || e.ErrorCode(taskR) != "PET_ARCHIVED" {
		t.Fatalf("archived mk task: %d %v", taskR.Status, taskR.Body)
	}
	// today 不含归档宠物
	today := e.Do("GET", "/api/v1/families/"+familyID+"/today", ownerTok, nil)
	if pets := today.Body["pets"].([]any); len(pets) != 0 {
		t.Fatalf("archived pet should not appear in today, got %d", len(pets))
	}
	_ = http.StatusOK
}

func TestConcurrentCompleteSingleLog(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, familyID, petID := e.SetupFamily("cc", "Milo")
	r := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok, `{"title":"并发喂药","schedule":{"v":1,"kind":"daily"}}`)
	taskID := r.Body["task"].(map[string]any)["id"].(string)
	_ = familyID

	// 两个成员 + owner 三方并发完成同一任务
	cgTok, cgID, _ := e.NewUser("cc-cg")
	ri := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	e.Do("POST", "/api/v1/families/join", cgTok, map[string]any{"code": ri.Body["invite_code"]})
	if r := e.Do("PUT", "/api/v1/care-plans/"+taskID+"/assignments/"+cgID, ownerTok, map[string]any{"role": "helper"}); r.Status != http.StatusOK {
		t.Fatalf("assign concurrent caregiver: %d %v", r.Status, r.Body)
	}

	toks := []string{ownerTok, cgTok, ownerTok}
	var wg sync.WaitGroup
	results := make([]*Resp, len(toks))
	for i, tok := range toks {
		wg.Add(1)
		go func(idx int, tk string) {
			defer wg.Done()
			results[idx] = e.Do("POST", "/api/v1/tasks/"+taskID+"/logs", tk, map[string]any{"status": "done"})
		}(i, tok)
	}
	wg.Wait()

	okCount, conflictCount := 0, 0
	for _, res := range results {
		switch res.Status {
		case http.StatusCreated:
			okCount++
		case http.StatusConflict:
			conflictCount++
			if res.Log == nil {
				t.Fatal("409 without authoritative log")
			}
		default:
			t.Fatalf("unexpected status %d: %v", res.Status, res.Body)
		}
	}
	if okCount != 1 || conflictCount != len(toks)-1 {
		t.Fatalf("expected 1 success + %d conflicts, got %d/%d", len(toks)-1, okCount, conflictCount)
	}

	// 数据库确证：仅一条 log
	today := e.Do("GET", "/api/v1/families/"+familyID+"/today", ownerTok, nil)
	logCount := 0
	for _, pg := range today.Body["pets"].([]any) {
		for _, item := range pg.(map[string]any)["items"].([]any) {
			if item.(map[string]any)["log"] != nil {
				logCount++
			}
		}
	}
	if logCount != 1 {
		t.Fatalf("expected exactly 1 task log in DB, got %d", logCount)
	}
}

// TestCareStatsFamilyScopeRequiresMembership：家庭口径的统计必须先做成员判定。
// 回归：曾经只查家庭行（FamilyTimezone 不携带授权语义），任何登录用户拿
// family UUID 即可读取他人家庭的完成率 —— IDOR。
func TestCareStatsFamilyScopeRequiresMembership(t *testing.T) {
	e := NewEnv(t)
	tok, _, familyID, petID := e.SetupFamily("cs", "Milo")
	from := time.Now().AddDate(0, 0, -3).Format("2006-01-02")
	to := time.Now().Format("2006-01-02")
	q := "/api/v1/care-stats?from=" + from + "&to=" + to + "&family_id=" + familyID

	// 成员可读
	if r := e.Do("GET", q, tok, nil); r.Status != http.StatusOK {
		t.Fatalf("member care-stats: %d %v", r.Status, r.Body)
	}
	// 非成员 → 404（不泄露圈存在性）
	other, _, _ := e.NewUser("cs-x")
	if r := e.Do("GET", q, other, nil); r.Status != http.StatusNotFound {
		t.Fatalf("non-member care-stats must be 404: %d %v", r.Status, r.Body)
	}
	// 归档宠只读：家庭口径的统计分母不再包含它（全部归档 → 空集口径）
	if r := e.Do("POST", "/api/v1/pets/"+petID+"/archive", tok, nil); r.Status != http.StatusOK {
		t.Fatalf("archive: %d %v", r.Status, r.Body)
	}
	r := e.Do("GET", q, tok, nil)
	if r.Status != http.StatusOK {
		t.Fatalf("archived-family care-stats: %d %v", r.Status, r.Body)
	}
	if r.Body["total"] != float64(0) || len(r.Body["per_pet"].([]any)) != 0 {
		t.Fatalf("archived pet must not be in family stats: %v", r.Body)
	}
}
