package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/joinplanet/planet-api/internal/contracts"
)

func mustTZ(t *testing.T, name string) *time.Location {
	t.Helper()
	tz, err := time.LoadLocation(name)
	if err != nil {
		t.Fatalf("load tz %s: %v", name, err)
	}
	return tz
}

// utc(y,m,d,h,min) 快速造时间。
func utc(year int, month time.Month, day, hour, min int) time.Time {
	return time.Date(year, month, day, hour, min, 0, 0, time.UTC)
}

func TestDecideDailyDigestAndAlerts(t *testing.T) {
	sh := mustTZ(t, "Asia/Shanghai") // UTC+8

	// 本地 19:59（UTC 11:59）→ 都不触发
	if _, ok := DecideDaily(utc(2026, 8, 19, 11, 59), sh, DigestHour); ok {
		t.Fatal("digest must not fire before local 20:00")
	}
	// 本地 20:00（UTC 12:00）→ 触发，日期取本地
	date, ok := DecideDaily(utc(2026, 8, 19, 12, 0), sh, DigestHour)
	if !ok || date != "2026-08-19" {
		t.Fatalf("digest fire at local 20:00: %q %v", date, ok)
	}
	// 本地 08:00（UTC 00:00）→ alerts 触发
	if date, ok := DecideDaily(utc(2026, 8, 19, 0, 0), sh, AlertsHour); !ok || date != "2026-08-19" {
		t.Fatalf("alerts fire at local 08:00: %q %v", date, ok)
	}
	// 跨日：本地 23:30（UTC 15:30）→ digest 触发且日期是本地"当天"
	if date, ok := DecideDaily(utc(2026, 8, 19, 15, 30), sh, DigestHour); !ok || date != "2026-08-19" {
		t.Fatalf("late-evening digest: %q %v", date, ok)
	}
	// 纽约（UTC-4 夏令时）：UTC 8/20 00:30 = 本地 8/19 20:30 → 触发、日期 08-19
	ny := mustTZ(t, "America/New_York")
	if date, ok := DecideDaily(utc(2026, 8, 20, 0, 30), ny, DigestHour); !ok || date != "2026-08-19" {
		t.Fatalf("ny digest: %q %v", date, ok)
	}
}

func TestDecideRemindersGraceAndEscalation(t *testing.T) {
	sh := mustTZ(t, "Asia/Shanghai")
	due := []contracts.DueTask{
		{TaskID: "t-0900", Title: "喂药", TimeOfDayMinutes: 9 * 60},
		{TaskID: "t-0700", Title: "遛狗", TimeOfDayMinutes: 7 * 60},
		{TaskID: "t-neg", Title: "无时段", TimeOfDayMinutes: -1},
	}

	// 本地 09:29 → 09:00 的任务仍在宽限（差 29 分钟）不触发；07:00 已过点 2h29m 触发（升级）
	fires := DecideReminders(utc(2026, 8, 19, 1, 29), sh, due)
	if len(fires) != 1 || fires[0].TaskID != "t-0700" || !fires[0].Escalated {
		t.Fatalf("only overdue t-0700 must fire at 09:29: %v", fires)
	}
	// 本地 09:30 → 恰好过点 30 分钟：09:00 任务也触发（未升级）
	fires = DecideReminders(utc(2026, 8, 19, 1, 30), sh, due)
	if len(fires) != 2 {
		t.Fatalf("expected t-0700 + t-0900, got %v", fires)
	}
	var fire900 *ReminderFire
	for i := range fires {
		if fires[i].TaskID == "t-0900" {
			fire900 = &fires[i]
		}
	}
	if fire900 == nil || fire900.Escalated {
		t.Fatal("t-0900 at 30min past due must fire without escalation")
	}
	if want := "2026-08-19:t-0900:09"; fire900.DedupeKey != want {
		t.Fatalf("dedupe key: %q want %q", fire900.DedupeKey, want)
	}
	// 本地 11:00 → 两者都升级（≥120 分钟）；小时桶 11
	fires = DecideReminders(utc(2026, 8, 19, 3, 0), sh, due)
	if len(fires) != 2 {
		t.Fatalf("expected 2 fires, got %v", fires)
	}
	for _, f := range fires {
		if !f.Escalated {
			t.Fatalf(">=2h overdue must escalate: %v", f)
		}
	}
	if want := "2026-08-19:t-0700:11"; fires[0].DedupeKey != want && fires[1].DedupeKey != want {
		t.Fatalf("hour bucket key missing: %v", fires)
	}
	// 同一小时桶内再次判定 → 同 key（由持久化运行记录去重）
	again := DecideReminders(utc(2026, 8, 19, 3, 42), sh, due)
	if len(again) != 2 || again[0].DedupeKey != "2026-08-19:t-0900:11" {
		t.Fatalf("same-hour re-eval keeps bucket: %v", again)
	}
}

func TestReminderBodyWording(t *testing.T) {
	normal := ReminderBody(ReminderFire{Title: "喂药"})
	esc := ReminderFire{Title: "喂药", Escalated: true}
	if normal != "「喂药」还没做哦" {
		t.Fatalf("normal wording: %q", normal)
	}
	if ReminderBody(esc) == normal {
		t.Fatal("escalated wording must differ")
	}
}

func TestCareRiskBodyWording(t *testing.T) {
	risk := contracts.CareRisk{PetName: "Milo", Title: "晚饭后遛狗"}
	if got := CareRiskBody(risk); got != "「Milo · 晚饭后遛狗」临近或已经到时间，但还没有负责人" {
		t.Fatalf("unassigned wording: %q", got)
	}
	risk.WaitingOnUser = true
	if got := CareRiskBody(risk); got != "「Milo · 晚饭后遛狗」还没有人负责，请现在确认谁来做" {
		t.Fatalf("waiting wording: %q", got)
	}
	risk.WaitingOnUser = false
	risk.EscalationFailed = true
	if got := CareRiskBody(risk); got != "「Milo · 晚饭后遛狗」之前的安排已过期，负责人还没完成，请重新安排" {
		t.Fatalf("expired escalation wording: %q", got)
	}
}

func TestExpoPushSenderPostsJSON(t *testing.T) {
	var gotBody []map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method: %s", r.Method)
		}
		if err := json.NewDecoder(r.Body).Decode(&gotBody); err != nil {
			t.Errorf("decode: %v", err)
		}
		_, _ = w.Write([]byte(`[{"status":"ok","id":"a"},{"status":"error","message":"nope","details":{"error":"DeviceNotRegistered"}}]`))
	}))
	defer srv.Close()
	e := &ExpoPushSender{Endpoint: srv.URL}
	err := e.SendData(context.Background(),
		[]string{"ExponentPushToken[a]", "ExponentPushToken[b]"}, "标题", "内容",
		map[string]string{"kind": "care_request", "care_request_id": "req-1"})
	if err != nil {
		t.Fatalf("send: %v", err)
	}
	if len(gotBody) != 2 || gotBody[0]["to"] != "ExponentPushToken[a]" ||
		gotBody[0]["title"] != "标题" || gotBody[1]["body"] != "内容" {
		t.Fatalf("payload: %v", gotBody)
	}
	data, ok := gotBody[0]["data"].(map[string]any)
	if !ok || data["kind"] != "care_request" || data["care_request_id"] != "req-1" {
		t.Fatalf("action payload: %v", gotBody[0]["data"])
	}
	if gotBody[0]["categoryId"] != "care_request" {
		t.Fatalf("care request category: %v", gotBody[0]["categoryId"])
	}
	if gotBody[0]["channelId"] != "care_coordination" {
		t.Fatalf("care coordination channel: %v", gotBody[0]["channelId"])
	}
	// 部分票据失败时，成功票据仍代表本批次已经送达，不触发整批重试。
	if err := e.Send(context.Background(), []string{"x", "y"}, "t", "b"); err != nil {
		t.Fatalf("partial ticket failure must not be fatal: %v", err)
	}
	// 空令牌列表为 no-op
	if err := e.Send(context.Background(), nil, "t", "b"); err != nil {
		t.Fatalf("empty tokens: %v", err)
	}
}

func TestExpoPushSenderReturnsErrorWhenAllTicketsFail(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`[{"status":"error","message":"nope","details":{"error":"DeviceNotRegistered"}}]`))
	}))
	defer srv.Close()
	e := &ExpoPushSender{Endpoint: srv.URL}
	if err := e.Send(context.Background(), []string{"ExponentPushToken[dead]"}, "标题", "内容"); err == nil {
		t.Fatal("all ticket failures must surface an error")
	}
}

func TestExpoPushSenderHTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer srv.Close()
	e := &ExpoPushSender{Endpoint: srv.URL}
	if err := e.Send(context.Background(), []string{"t"}, "a", "b"); err == nil {
		t.Fatal("http >=300 must surface error")
	}
}

func TestExpoPushSenderUsesBatchCareActionCategory(t *testing.T) {
	var gotBody []map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&gotBody); err != nil {
			t.Errorf("decode: %v", err)
		}
		_, _ = w.Write([]byte(`[{"status":"ok"}]`))
	}))
	defer srv.Close()
	e := &ExpoPushSender{Endpoint: srv.URL}
	if err := e.SendData(context.Background(), []string{"ExponentPushToken[batch]"}, "交班", "请确认", map[string]string{
		"kind": "care_handoff_batch", "care_batch_id": "batch-1",
	}); err != nil {
		t.Fatalf("send batch: %v", err)
	}
	if len(gotBody) != 1 || gotBody[0]["categoryId"] != "care_handoff_batch" || gotBody[0]["channelId"] != "care_coordination" {
		t.Fatalf("batch notification category: %v", gotBody)
	}
}

func TestPushLogsDoNotContainNotificationSecrets(t *testing.T) {
	var logBuf bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&logBuf, nil))
	token := "ExponentPushToken[private-device-token]"
	dev := &DevPushSender{Log: logger}
	if err := dev.SendData(context.Background(), []string{token}, "宠物健康提醒", "包含不应进日志的照护内容", map[string]string{"kind": "care_request"}); err != nil {
		t.Fatalf("dev push: %v", err)
	}
	logLine := logBuf.String()
	for _, secret := range []string{token, "宠物健康提醒", "包含不应进日志的照护内容"} {
		if strings.Contains(logLine, secret) {
			t.Fatalf("push log leaked %q: %s", secret, logLine)
		}
	}
	if !strings.Contains(logLine, "token_count=1") || !strings.Contains(logLine, "kind=care_request") {
		t.Fatalf("push log lost safe diagnostic fields: %s", logLine)
	}
}

func TestExpoPushShortTicketResponseIsSafe(t *testing.T) {
	var logBuf bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&logBuf, nil))
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		// A malformed/partial provider response must not index past tokens.
		_, _ = w.Write([]byte(`[{"status":"error","message":"nope","details":{"error":"DeviceNotRegistered"}}]`))
	}))
	defer srv.Close()
	e := &ExpoPushSender{Endpoint: srv.URL, Log: logger}
	secret := "ExponentPushToken[private-device-token]"
	if err := e.Send(context.Background(), []string{secret, "second-token"}, "title", "body"); err == nil {
		t.Fatal("a short provider response must surface an error")
	}
	logLine := logBuf.String()
	if strings.Contains(logLine, secret) || strings.Contains(logLine, "second-token") {
		t.Fatalf("expo log leaked raw token: %s", logLine)
	}
	if !strings.Contains(logLine, "token_fingerprint=") || !strings.Contains(logLine, "ticket_index=0") {
		t.Fatalf("expo log missing safe failure context: %s", logLine)
	}
}
