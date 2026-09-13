// P0 主动服务三件套：预警 / 摘要 / 推送令牌与偏好。
package integration

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"testing"
	"time"

	"github.com/joinplanet/planet-api/internal/app"
	"github.com/joinplanet/planet-api/internal/modules/notify"
	"github.com/joinplanet/planet-api/internal/platform/clockx"
	"github.com/joinplanet/planet-api/internal/platform/email"
)

func TestPushTokenCRUD(t *testing.T) {
	e := NewEnv(t)
	tok, _, _ := e.NewUser("pt")

	// 注册 → 201
	r := e.Do("POST", "/api/v1/me/push-tokens", tok, map[string]any{
		"token": "ExponentPushToken[abc123]", "platform": "ios",
	})
	if r.Status != http.StatusCreated {
		t.Fatalf("register: %d %v", r.Status, r.Body)
	}
	if r.Body["push_token"].(map[string]any)["platform"] != "ios" {
		t.Fatalf("platform: %v", r.Body)
	}
	// 幂等重复注册 → 201（覆盖语义）
	if r := e.Do("POST", "/api/v1/me/push-tokens", tok, map[string]any{
		"token": "ExponentPushToken[abc123]", "platform": "ios",
	}); r.Status != http.StatusCreated {
		t.Fatalf("re-register: %d %v", r.Status, r.Body)
	}
	// 非法 platform → 400
	if r := e.Do("POST", "/api/v1/me/push-tokens", tok, map[string]any{
		"token": "ExponentPushToken[x]", "platform": "nokia",
	}); r.Status != http.StatusBadRequest {
		t.Fatalf("bad platform: %d", r.Status)
	}
	// 删除 → 204；再删 → 404
	if r := e.Do("DELETE", "/api/v1/me/push-tokens", tok, map[string]any{"token": "ExponentPushToken[abc123]"}); r.Status != http.StatusNoContent {
		t.Fatalf("delete: %d %v", r.Status, r.Body)
	}
	if r := e.Do("DELETE", "/api/v1/me/push-tokens", tok, map[string]any{"token": "ExponentPushToken[abc123]"}); r.Status != http.StatusNotFound {
		t.Fatalf("re-delete: %d", r.Status)
	}
	// 他人令牌不可删：换账号注册同 token 后原用户再删 → 404（user_id 已被覆盖）
	otherTok, _, _ := e.NewUser("pt-x")
	if r := e.Do("POST", "/api/v1/me/push-tokens", otherTok, map[string]any{
		"token": "ExponentPushToken[abc123]", "platform": "android",
	}); r.Status != http.StatusCreated {
		t.Fatalf("rebind: %d %v", r.Status, r.Body)
	}
	if r := e.Do("DELETE", "/api/v1/me/push-tokens", tok, map[string]any{"token": "ExponentPushToken[abc123]"}); r.Status != http.StatusNotFound {
		t.Fatalf("delete after rebind must 404 for previous owner: %d", r.Status)
	}
}

func TestNotificationPrefs(t *testing.T) {
	e := NewEnv(t)
	tok, _, familyID, _ := e.SetupFamily("np", "Milo")

	// 缺行默认全开
	r := e.Do("GET", "/api/v1/families/"+familyID+"/notification-prefs", tok, nil)
	if r.Status != http.StatusOK {
		t.Fatalf("get prefs: %d %v", r.Status, r.Body)
	}
	p := r.Body["prefs"].(map[string]any)
	if p["reminders"] != true || p["digest"] != true || p["alerts"] != true {
		t.Fatalf("defaults must be all-on: %v", p)
	}
	// 局部更新（未传字段保持）
	r = e.Do("PUT", "/api/v1/families/"+familyID+"/notification-prefs", tok, map[string]any{"digest": false})
	if r.Status != http.StatusOK {
		t.Fatalf("put prefs: %d %v", r.Status, r.Body)
	}
	p = r.Body["prefs"].(map[string]any)
	if p["digest"] != false || p["reminders"] != true {
		t.Fatalf("partial update: %v", p)
	}
	// 读回一致
	r = e.Do("GET", "/api/v1/families/"+familyID+"/notification-prefs", tok, nil)
	if r.Body["prefs"].(map[string]any)["digest"] != false {
		t.Fatalf("persisted prefs: %v", r.Body)
	}
	// 非成员 → 404（不泄露圈存在性）
	other, _, _ := e.NewUser("np-x")
	if r := e.Do("GET", "/api/v1/families/"+familyID+"/notification-prefs", other, nil); r.Status != http.StatusNotFound {
		t.Fatalf("non-member: %d", r.Status)
	}
}

func TestNotificationOutboxClaimRetryAndComplete(t *testing.T) {
	e := NewEnv(t)
	_, userID, _ := e.NewUser("notify-outbox")
	repo := &notify.Repo{Pool: e.Pool}
	n := notify.Notification{
		UserID: userID,
		Title:  "请确认照护",
		Body:   "请确认是否能做",
		Kind:   "care_request",
		Data:   map[string]string{"kind": "care_request", "care_request_id": "request-1"},
	}
	ctx := context.Background()
	if err := repo.EnqueueNotification(ctx, e.Pool, n); err != nil {
		t.Fatalf("enqueue: %v", err)
	}
	claimed, err := repo.ClaimNotifications(ctx, e.Pool, 10)
	if err != nil || len(claimed) != 1 {
		t.Fatalf("claim: len=%d err=%v", len(claimed), err)
	}
	if claimed[0].Attempts != 1 || claimed[0].Data["care_request_id"] != "request-1" {
		t.Fatalf("claimed payload: %+v", claimed[0])
	}
	if err := repo.FailNotification(ctx, e.Pool, claimed[0], "provider unavailable", time.Now()); err != nil {
		t.Fatalf("fail: %v", err)
	}
	if _, err := e.Pool.Exec(ctx, `UPDATE notification_outbox SET available_at=now() WHERE id=$1`, claimed[0].ID); err != nil {
		t.Fatalf("make retry ready: %v", err)
	}
	retried, err := repo.ClaimNotifications(ctx, e.Pool, 10)
	if err != nil || len(retried) != 1 || retried[0].Attempts != 2 {
		t.Fatalf("retry claim: items=%+v err=%v", retried, err)
	}
	if err := repo.MarkNotificationSent(ctx, e.Pool, retried[0].ID); err != nil {
		t.Fatalf("mark sent: %v", err)
	}
	if remaining, err := repo.ClaimNotifications(ctx, e.Pool, 10); err != nil || len(remaining) != 0 {
		t.Fatalf("sent row was claimed again: items=%+v err=%v", remaining, err)
	}
}

// addEvent 记 timeline 事件（weight/symptom 等用户类型）。
func addEvent(t *testing.T, e *Env, tok, petID, typ string, daysAgo int, payload string) {
	t.Helper()
	at := time.Now().UTC().AddDate(0, 0, -daysAgo).Format(time.RFC3339)
	r := e.DoJSON("POST", "/api/v1/pets/"+petID+"/timeline", tok,
		fmt.Sprintf(`{"type":%q,"occurred_at":%q,"payload":%s}`, typ, at, payload))
	if r.Status != http.StatusCreated {
		t.Fatalf("add %s event: %d %v", typ, r.Status, r.Body)
	}
}

func TestAlertsEndpointRulesOverRealData(t *testing.T) {
	e := NewEnv(t)
	tok, _, familyID, petID := e.SetupFamily("al", "Milo")

	// weight：10 天内 -12% → warn
	addEvent(t, e, tok, petID, "weight", 10, `{"weight_g":5000}`)
	addEvent(t, e, tok, petID, "weight", 2, `{"weight_g":4400}`)
	// symptom：14 天内同标题两次 → watch
	addEvent(t, e, tok, petID, "symptom", 5, `{"title":"Vomiting"}`)
	addEvent(t, e, tok, petID, "symptom", 1, `{"title":"vomiting"}`)
	// medication：真实 medication-linked occurrence marked missed → warn
	med := e.Do("POST", "/api/v1/pets/"+petID+"/medications", tok, map[string]any{
		"name": "抗生素", "dose": "1 片", "schedule": "每天早上",
	})
	if med.Status != http.StatusCreated {
		t.Fatalf("medication: %d %v", med.Status, med.Body)
	}
	medID := med.Body["medication"].(map[string]any)["id"].(string)
	medTask := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", tok,
		fmt.Sprintf(`{"title":"喂抗生素","medication_id":%q,"schedule":{"v":1,"kind":"daily"},"time_of_day":"08:00"}`, medID))
	if medTask.Status != http.StatusCreated {
		t.Fatalf("medication task: %d %v", medTask.Status, medTask.Body)
	}
	medOccurrenceID := medTask.Body["task"].(map[string]any)["id"].(string)
	// Keep the fixture valid at the civil-date boundary. The medication API
	// defaults started_on to the family's current date, while a fixed "now -
	// 2h" can already belong to yesterday in Asia/Shanghai. The alert rule is
	// intentionally strict about medication coverage, so align the fixture's
	// start date with the occurrence instead of making production logic weaker.
	missedAt := time.Now().UTC().Add(-2 * time.Hour)
	if _, err := e.Pool.Exec(context.Background(), `
		WITH updated AS (
			UPDATE care_occurrences
			SET status='missed', due_at=$2, due_date=($2 AT TIME ZONE 'Asia/Shanghai')::date
			WHERE id=$1
			RETURNING care_plan_id, due_date
		)
		UPDATE medications m
		SET started_on=updated.due_date
		FROM updated
		JOIN care_plans cp ON cp.id=updated.care_plan_id
		WHERE m.id=cp.medication_id`, medOccurrenceID, missedAt); err != nil {
		t.Fatalf("mark medication occurrence missed: %v", err)
	}

	r := e.Do("GET", "/api/v1/families/"+familyID+"/alerts", tok, nil)
	if r.Status != http.StatusOK {
		t.Fatalf("alerts: %d %v", r.Status, r.Body)
	}
	list, _ := r.Body["alerts"].([]any)
	if len(list) != 3 {
		t.Fatalf("expected weight_change + symptom_repeat + medication_silence, got %v", r.Body)
	}
	kinds := map[string]map[string]any{}
	for _, a := range list {
		m := a.(map[string]any)
		kinds[m["kind"].(string)] = m
	}
	w := kinds["weight_change"]
	if w == nil || w["severity"] != "warn" || w["pet_id"] != petID {
		t.Fatalf("weight_change alert: %v", w)
	}
	if w["title"] != "Milo 体重变化 -12.0%" {
		t.Fatalf("weight title must use pet name: %v", w["title"])
	}
	s := kinds["symptom_repeat"]
	if s == nil || s["severity"] != "watch" {
		t.Fatalf("symptom_repeat alert: %v", s)
	}
	if s["data"].(map[string]any)["count"] != float64(2) {
		t.Fatalf("symptom count: %v", s)
	}
	m := kinds["medication_silence"]
	if m == nil || m["severity"] != "warn" || m["title"] != "Milo 可能漏服：抗生素" {
		t.Fatalf("medication_silence alert: %v", m)
	}

	// 非成员 404；无数据的圈 → 空数组（200）
	other, _, _ := e.NewUser("al-x")
	if r := e.Do("GET", "/api/v1/families/"+familyID+"/alerts", other, nil); r.Status != http.StatusNotFound {
		t.Fatalf("non-member alerts: %d", r.Status)
	}
	tok2, _, family2, _ := e.SetupFamily("al2", "Empty")
	if r := e.Do("GET", "/api/v1/families/"+family2+"/alerts", tok2, nil); r.Status != http.StatusOK {
		t.Fatalf("empty family alerts: %d %v", r.Status, r.Body)
	} else if list, _ := r.Body["alerts"].([]any); len(list) != 0 {
		t.Fatalf("empty family must yield empty alerts: %v", r.Body)
	}
}

func TestDigestGetAndSend(t *testing.T) {
	e := NewEnv(t)
	tok, _, familyID, petID := e.SetupFamily("dg", "Milo")
	alertOnly := e.Do("POST", "/api/v1/families/"+familyID+"/pets", tok, map[string]any{"name": "AlertOnly", "species": "cat"})
	if alertOnly.Status != http.StatusCreated {
		t.Fatalf("create alert-only pet: %d %v", alertOnly.Status, alertOnly.Body)
	}
	alertOnlyPetID := alertOnly.Body["pet"].(map[string]any)["id"].(string)

	// 三个任务：完成一个、跳过一个、剩一个待办
	mk := func(title string) string {
		r := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", tok,
			`{"title":"`+title+`","schedule":{"v":1,"kind":"daily"},"time_of_day":"09:00"}`)
		if r.Status != http.StatusCreated {
			t.Fatalf("mk task %s: %d %v", title, r.Status, r.Body)
		}
		return r.Body["task"].(map[string]any)["id"].(string)
	}
	done := mk("喂药")
	skip := mk("洗澡")
	pendingID := mk("梳毛")
	if r := e.Do("POST", "/api/v1/tasks/"+done+"/logs", tok, map[string]any{"status": "done"}); r.Status != http.StatusCreated {
		t.Fatalf("done log: %d %v", r.Status, r.Body)
	}
	if r := e.Do("POST", "/api/v1/tasks/"+skip+"/logs", tok, map[string]any{"status": "skipped"}); r.Status != http.StatusCreated {
		t.Fatalf("skip log: %d %v", r.Status, r.Body)
	}
	// 一条预警进摘要
	addEvent(t, e, tok, petID, "weight", 10, `{"weight_g":5000}`)
	addEvent(t, e, tok, petID, "weight", 2, `{"weight_g":4400}`)
	addEvent(t, e, tok, alertOnlyPetID, "weight", 10, `{"weight_g":5000}`)
	addEvent(t, e, tok, alertOnlyPetID, "weight", 2, `{"weight_g":4400}`)
	invite := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", tok, nil)
	memberTok, memberID, _ := e.NewUser("dg-member")
	if joined := e.Do("POST", "/api/v1/families/join", memberTok, map[string]any{"code": invite.Body["invite_code"]}); joined.Status != http.StatusOK {
		t.Fatalf("join digest member: %d %v", joined.Status, joined.Body)
	}
	request := e.doWithHeader("POST", "/api/v1/care-occurrences/"+pendingID+"/requests", tok, map[string]any{
		"family_id": familyID, "target_user_id": memberID, "message": "请接手梳毛",
	}, "digest-link-request")
	if request.Status != http.StatusCreated {
		t.Fatalf("create digest link request: %d %v", request.Status, request.Body)
	}
	requestID := request.Body["care_request"].(map[string]any)["id"].(string)

	r := e.Do("GET", "/api/v1/families/"+familyID+"/digest", tok, nil)
	if r.Status != http.StatusOK {
		t.Fatalf("digest: %d %v", r.Status, r.Body)
	}
	if r.Body["timezone"] != "Asia/Shanghai" {
		t.Fatalf("timezone: %v", r.Body["timezone"])
	}
	pets := r.Body["pets"].([]any)
	if len(pets) != 2 {
		t.Fatalf("pets: %v", r.Body)
	}
	var p map[string]any
	var alertOnlyPet map[string]any
	for _, raw := range pets {
		candidate := raw.(map[string]any)
		if candidate["pet_id"] == petID {
			p = candidate
		}
		if candidate["pet_id"] == alertOnlyPetID {
			alertOnlyPet = candidate
		}
	}
	if p == nil || alertOnlyPet == nil {
		t.Fatalf("digest must include both task and alert-only pets: %v", r.Body)
	}
	if p["pet_name"] != "Milo" {
		t.Fatalf("pet_name: %v", p)
	}
	if len(p["done"].([]any)) != 1 || len(p["skipped"].([]any)) != 1 || len(p["pending"].([]any)) != 1 {
		t.Fatalf("done/skipped/pending: %v", p)
	}
	d0 := p["done"].([]any)[0].(map[string]any)
	if d0["occurrence_id"] != done || d0["title"] != "喂药" || d0["by_name"] == "" || d0["at"] == nil {
		t.Fatalf("done item: %v", d0)
	}
	pd0 := p["pending"].([]any)[0].(map[string]any)
	if pd0["occurrence_id"] == nil || pd0["time_of_day"] != "09:00" {
		t.Fatalf("pending time_of_day: %v", pd0)
	}
	var linked bool
	for _, raw := range p["pending"].([]any) {
		item := raw.(map[string]any)
		if item["occurrence_id"] == pendingID {
			linked = item["care_request_id"] == requestID
		}
	}
	if !linked {
		t.Fatalf("digest pending item must link to latest care request: %v", p["pending"])
	}
	sk0 := p["skipped"].([]any)[0].(map[string]any)
	if sk0["occurrence_id"] != skip {
		t.Fatalf("skipped item must link to its occurrence: %v", sk0)
	}
	if len(p["alerts"].([]any)) != 1 {
		t.Fatalf("digest must embed alerts: %v", p["alerts"])
	}
	if alertOnlyPet["pet_name"] != "AlertOnly" || len(alertOnlyPet["done"].([]any)) != 0 || len(alertOnlyPet["pending"].([]any)) != 0 || len(alertOnlyPet["skipped"].([]any)) != 0 || len(alertOnlyPet["alerts"].([]any)) != 1 {
		t.Fatalf("digest must preserve alert-only pet: %v", alertOnlyPet)
	}

	// 非成员 404
	other, _, _ := e.NewUser("dg-x")
	if r := e.Do("GET", "/api/v1/families/"+familyID+"/digest", other, nil); r.Status != http.StatusNotFound {
		t.Fatalf("non-member digest: %d", r.Status)
	}

	// send：DevSender 向两个开启摘要偏好的成员成功投递
	r = e.Do("POST", "/api/v1/families/"+familyID+"/digest/send", tok, nil)
	if r.Status != http.StatusOK {
		t.Fatalf("digest send: %d %v", r.Status, r.Body)
	}
	if r.Body["sent"] != float64(2) {
		t.Fatalf("sent: %v", r.Body)
	}
}

// TestSchedulerCore：调度器的两个持久化核心（不跑 ticker，无 sleep）：
// ClaimRun 的一次性抢占（重启安全）与 DueForReminder 的候选查询。
func TestSchedulerCore(t *testing.T) {
	e := NewEnv(t)
	tok, _, familyID, petID := e.SetupFamily("sc", "Milo")

	log := slog.New(slog.NewJSONHandler(io.Discard, nil))
	ops := app.NewProactiveOps(e.Pool, log, &email.DevSender{Log: log})
	ctx := context.Background()

	// ClaimRun：同 (job, family, key) 只抢到一次
	r1, err := ops.Notify.Repo.ClaimRun(ctx, e.Pool, "digest", familyID, "2026-08-19")
	if err != nil || !r1 {
		t.Fatalf("first claim: %v %v", r1, err)
	}
	r2, err := ops.Notify.Repo.ClaimRun(ctx, e.Pool, "digest", familyID, "2026-08-19")
	if err != nil || r2 {
		t.Fatalf("second claim must lose: %v %v", r2, err)
	}
	// 不同 key 不受影响
	if ok, err := ops.Notify.Repo.ClaimRun(ctx, e.Pool, "digest", familyID, "2026-08-20"); err != nil || !ok {
		t.Fatalf("other key claim: %v %v", ok, err)
	}

	// 重试上限：attempts 达到 MaxJobAttempts 后 FailRun 置 available_at=infinity，
	// 该 key 永久退出候选（不再每分钟重试刷日志）。
	if _, err := e.Pool.Exec(ctx, `UPDATE job_runs SET attempts=$1 WHERE job='digest' AND family_id=$2 AND dedupe_key='2026-08-20'`,
		notify.MaxJobAttempts, familyID); err != nil {
		t.Fatalf("bump attempts: %v", err)
	}
	if err := ops.Notify.Repo.FailRun(ctx, e.Pool, "digest", familyID, "2026-08-20", "boom"); err != nil {
		t.Fatalf("fail run: %v", err)
	}
	var dead bool
	if err := e.Pool.QueryRow(ctx, `SELECT available_at = 'infinity'::timestamptz FROM job_runs WHERE job='digest' AND family_id=$1 AND dedupe_key='2026-08-20'`,
		familyID).Scan(&dead); err != nil {
		t.Fatalf("read dead flag: %v", err)
	}
	if !dead {
		t.Fatal("attempts at cap must park the key at infinity")
	}

	// DueForReminder：当日排程 + 有时段 + 无 log 的任务进入候选（分钟数正确）
	r := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", tok,
		`{"title":"喂药","schedule":{"v":1,"kind":"daily"},"time_of_day":"09:05"}`)
	if r.Status != http.StatusCreated {
		t.Fatalf("mk task: %d %v", r.Status, r.Body)
	}
	taskID := r.Body["task"].(map[string]any)["id"].(string)
	r = e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", tok,
		`{"title":"无时段","schedule":{"v":1,"kind":"daily"}}`)
	if r.Status != http.StatusCreated {
		t.Fatalf("mk task 2: %d %v", r.Status, r.Body)
	}
	due, err := ops.Tasks.DueForReminder(ctx, familyID, clockx.New().Now())
	if err != nil {
		t.Fatalf("due: %v", err)
	}
	found := false
	for _, d := range due {
		if d.TaskID == taskID {
			found = true
			if d.TimeOfDayMinutes != 9*60+5 || d.Title != "喂药" {
				t.Fatalf("due item: %+v", d)
			}
		}
	}
	if !found {
		t.Fatalf("due task missing: %+v", due)
	}
	// 无负责人且临近 due_at 的 occurrence 必须进入照护风险候选；它不能
	// 因为 reminder 的 time_of_day 规则而被漏掉。
	now := clockx.New().Now()
	nearDue := now.Add(30 * time.Minute)
	if shanghai, err := time.LoadLocation("Asia/Shanghai"); err == nil && nearDue.In(shanghai).Format("2006-01-02") != now.In(shanghai).Format("2006-01-02") {
		// Keep the fixture on the same civil day when the test runs near
		// midnight; the production rule still rejects genuinely future dates.
		nearDue = now.Add(1 * time.Minute)
	}
	if _, err := e.Pool.Exec(ctx, `UPDATE care_occurrences SET due_at=$2, assigned_to_user_id=NULL WHERE id=$1`, taskID, nearDue); err != nil {
		t.Fatalf("move occurrence near due: %v", err)
	}
	// The risk projection carries the requested family's timezone. An unrelated
	// family must not multiply the same occurrence through the families join.
	e.SetupFamily("care-risk-other", "Other")
	risks, err := ops.Tasks.UnassignedCareRisks(ctx, familyID, now)
	if err != nil {
		t.Fatalf("care risks: %v", err)
	}
	if len(risks) != 1 {
		t.Fatalf("care risks must be unique to the requested family: %+v", risks)
	}
	var riskFound bool
	for _, risk := range risks {
		if risk.OccurrenceID == taskID {
			riskFound = true
			if risk.WaitingOnUser {
				t.Fatal("unassigned occurrence must not claim a request is waiting")
			}
		}
	}
	if !riskFound {
		t.Fatalf("unassigned near-due task missing from risks: %+v", risks)
	}
	// HTTP projection keeps the same occurrence identity so Today can reopen
	// the existing care action rather than creating a duplicate todo.
	r = e.Do("GET", "/api/v1/families/"+familyID+"/care-risks", tok, nil)
	if r.Status != http.StatusOK {
		t.Fatalf("care risks endpoint: %d %v", r.Status, r.Body)
	}
	var projected bool
	for _, raw := range r.Body["risks"].([]any) {
		item := raw.(map[string]any)
		if item["occurrence_id"] == taskID {
			projected = true
			if item["waiting_on_user"] != false || item["request_id"] != "" || item["can_claim"] != true {
				t.Fatalf("unassigned risk projection: %+v", item)
			}
		}
	}
	if !projected {
		t.Fatalf("unassigned risk missing from HTTP projection: %+v", r.Body)
	}
	// Today passes its selected civil date. An old overdue occurrence may still
	// be useful to the scheduler, but it must not be rendered beside today's
	// items as a contradictory "no owner" warning.
	shanghai, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		t.Fatalf("load family timezone: %v", err)
	}
	yesterdayDue := now.Add(-24 * time.Hour)
	if _, err := e.Pool.Exec(ctx, `UPDATE care_occurrences SET due_at=$2 WHERE id=$1`, taskID, yesterdayDue); err != nil {
		t.Fatalf("move occurrence to yesterday: %v", err)
	}
	todayDate := now.In(shanghai).Format("2006-01-02")
	yesterdayDate := yesterdayDue.In(shanghai).Format("2006-01-02")
	currentDateRisks := e.Do("GET", "/api/v1/families/"+familyID+"/care-risks?date="+todayDate, tok, nil)
	if currentDateRisks.Status != http.StatusOK {
		t.Fatalf("date-filtered current risks: %d %v", currentDateRisks.Status, currentDateRisks.Body)
	}
	for _, raw := range currentDateRisks.Body["risks"].([]any) {
		if raw.(map[string]any)["occurrence_id"] == taskID {
			t.Fatalf("yesterday occurrence must not appear in today's risks: %+v", currentDateRisks.Body)
		}
	}
	yesterdayRisks := e.Do("GET", "/api/v1/families/"+familyID+"/care-risks?date="+yesterdayDate, tok, nil)
	if yesterdayRisks.Status != http.StatusOK {
		t.Fatalf("date-filtered yesterday risks: %d %v", yesterdayRisks.Status, yesterdayRisks.Body)
	}
	var yesterdayProjected bool
	for _, raw := range yesterdayRisks.Body["risks"].([]any) {
		if raw.(map[string]any)["occurrence_id"] == taskID {
			yesterdayProjected = true
		}
	}
	if !yesterdayProjected {
		t.Fatalf("yesterday occurrence must remain available to its selected date: %+v", yesterdayRisks.Body)
	}
	if _, err := e.Pool.Exec(ctx, `UPDATE care_occurrences SET due_at=$2 WHERE id=$1`, taskID, nearDue); err != nil {
		t.Fatalf("restore occurrence due time: %v", err)
	}
	for _, d := range due {
		if d.Title == "无时段" {
			t.Fatalf("task without time_of_day must not be a reminder candidate: %+v", d)
		}
	}
	// 完成后退出候选
	if r := e.Do("POST", "/api/v1/tasks/"+taskID+"/logs", tok, map[string]any{"status": "done"}); r.Status != http.StatusCreated {
		t.Fatalf("done: %d %v", r.Status, r.Body)
	}
	due, _ = ops.Tasks.DueForReminder(ctx, familyID, clockx.New().Now())
	for _, d := range due {
		if d.TaskID == taskID {
			t.Fatalf("logged task must leave candidates: %+v", d)
		}
	}
}

// TestDigestSendPrefsAndDailyDedupe：手动群发的三重门禁。
// ① 仅 owner 可触发（caregiver 403）；② 只投递开启 digest 偏好的成员；
// ③ 与调度器共用 (family, 业务日) 的 job_runs 去重 —— 同一天第二次调用 skipped。
func TestDigestSendPrefsAndDailyDedupe(t *testing.T) {
	e := NewEnv(t)
	tok, _, familyID, _ := e.SetupFamily("dp", "Milo")

	ri := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", tok, nil)
	if ri.Status != http.StatusOK {
		t.Fatalf("refresh invite: %d %v", ri.Status, ri.Body)
	}
	invite := ri.Body["invite_code"].(string)
	cgTok, _, _ := e.NewUser("dp-cg")
	if r := e.Do("POST", "/api/v1/families/join", cgTok, map[string]any{"code": invite}); r.Status != http.StatusOK {
		t.Fatalf("join: %d %v", r.Status, r.Body)
	}
	if r := e.Do("PUT", "/api/v1/families/"+familyID+"/notification-prefs", cgTok, map[string]any{"digest": false}); r.Status != http.StatusOK {
		t.Fatalf("prefs off: %d %v", r.Status, r.Body)
	}

	// caregiver 手动群发 → 403
	if r := e.Do("POST", "/api/v1/families/"+familyID+"/digest/send", cgTok, nil); r.Status != http.StatusForbidden {
		t.Fatalf("caregiver digest send must be 403: %d %v", r.Status, r.Body)
	}

	// owner 发送：digest 关闭的成员不在收件人里（本圈 = owner 一人）
	r := e.Do("POST", "/api/v1/families/"+familyID+"/digest/send", tok, nil)
	if r.Status != http.StatusOK {
		t.Fatalf("owner digest send: %d %v", r.Status, r.Body)
	}
	if r.Body["sent"] != float64(1) {
		t.Fatalf("sent must exclude digest-off member: %v", r.Body)
	}

	// 同一天再次触发 → skipped、不重复投递
	r2 := e.Do("POST", "/api/v1/families/"+familyID+"/digest/send", tok, nil)
	if r2.Status != http.StatusOK || r2.Body["skipped"] != true || r2.Body["sent"] != float64(0) {
		t.Fatalf("same-day dedupe: %d %v", r2.Status, r2.Body)
	}
}
