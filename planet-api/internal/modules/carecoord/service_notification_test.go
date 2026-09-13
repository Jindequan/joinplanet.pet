package carecoord

import (
	"context"
	"testing"
	"time"
)

type notificationSpy struct {
	userID string
	kind   string
	data   map[string]string
}

func (s *notificationSpy) NotifyUser(context.Context, string, string, string, string) error {
	return nil
}

func (s *notificationSpy) NotifyUserData(_ context.Context, userID, _, _, kind string, data map[string]string) error {
	s.userID = userID
	s.kind = kind
	s.data = data
	return nil
}

func TestNotifyCareRequestIncludesOccurrenceContext(t *testing.T) {
	spy := &notificationSpy{}
	svc := &Service{Notifier: spy}

	svc.notify(context.Background(), "user-1", "request-1", "occurrence-1", "family-1", "pet-1", "title", "body")

	if spy.userID != "user-1" || spy.kind != "care_request" {
		t.Fatalf("notification target: user=%q kind=%q", spy.userID, spy.kind)
	}
	if spy.data["care_request_id"] != "request-1" || spy.data["occurrence_id"] != "occurrence-1" || spy.data["family_id"] != "family-1" || spy.data["pet_id"] != "pet-1" {
		t.Fatalf("action payload: %#v", spy.data)
	}
}

func TestNotifyBatchCarriesOnlyBatchActionContext(t *testing.T) {
	spy := &notificationSpy{}
	svc := &Service{Notifier: spy}

	svc.notifyBatch(context.Background(), "user-1", "batch-1", "family-1", "title", "body")

	if spy.userID != "user-1" || spy.kind != "care_handoff_batch" {
		t.Fatalf("batch notification target: user=%q kind=%q", spy.userID, spy.kind)
	}
	if spy.data["care_batch_id"] != "batch-1" || spy.data["kind"] != "care_handoff_batch" {
		t.Fatalf("batch action payload: %#v", spy.data)
	}
	if spy.data["family_id"] != "family-1" {
		t.Fatalf("batch family context: %#v", spy.data)
	}
	if _, ok := spy.data["care_request_id"]; ok {
		t.Fatalf("batch action must not carry a request id: %#v", spy.data)
	}
}

func TestNotifyStatusIsReadOnlyHandoffContext(t *testing.T) {
	spy := &notificationSpy{}
	svc := &Service{Notifier: spy}

	svc.notifyStatus(context.Background(), "user-1", "request-1", "family-1", "pet-1", "title", "body")

	if spy.kind != "care_handoff" {
		t.Fatalf("status notification kind: %q", spy.kind)
	}
	if spy.data["care_request_id"] != "request-1" || spy.data["kind"] != "care_handoff" {
		t.Fatalf("status payload: %#v", spy.data)
	}
	if spy.data["family_id"] != "family-1" || spy.data["pet_id"] != "pet-1" {
		t.Fatalf("status context: %#v", spy.data)
	}
}

func TestRequestBodyUsesFamilyTimezoneForNotificationTime(t *testing.T) {
	dueAt := time.Date(2026, 9, 9, 12, 0, 0, 0, time.UTC)
	body := requestBody(Request{
		FamilyTimezone:  "Asia/Shanghai",
		PetName:         "Panghu",
		DueAt:           &dueAt,
		OccurrenceTime:  func() *time.Time { value := dueAt; return &value }(),
		OccurrenceTitle: "晚饭后遛狗",
	}, "请选一个处理方式")
	if body != "请选一个处理方式：20:00 · Panghu · 晚饭后遛狗" {
		t.Fatalf("family-local notification body: %q", body)
	}
}

func TestRequestBodyKeepsLegacyRowsReadableWithoutPetName(t *testing.T) {
	body := requestBody(Request{OccurrenceTitle: "喂水"}, "请确认是否能做")
	if body != "请确认是否能做：喂水" {
		t.Fatalf("legacy notification body: %q", body)
	}
}

func TestRequestActionBodyIncludesAppFallback(t *testing.T) {
	body := requestActionBody(Request{PetName: "Panghu", OccurrenceTitle: "喂水"})
	if body != "请选一个处理方式：Panghu · 喂水 · 打开 PLANET 处理" {
		t.Fatalf("action notification fallback body: %q", body)
	}
}

func TestBatchBodyIncludesCompactFamilyLocalPreview(t *testing.T) {
	dueAt := time.Date(2026, 9, 9, 12, 0, 0, 0, time.UTC)
	body := batchBody(HandoffBatchView{
		FamilyTimezone: "Asia/Shanghai",
		TotalCount:     3,
		Message:        "我今晚加班",
		Requests: []Request{
			{PetName: "Milo", OccurrenceTitle: "晚饭后遛狗", DueAt: &dueAt},
			{PetName: "Nala", OccurrenceTitle: "喂药", DueAt: &dueAt},
			{PetName: "豆豆", OccurrenceTitle: "补水", DueAt: &dueAt},
		},
	}, "请选你能做的")
	want := "请选你能做的：共 3 项 · Milo · 晚饭后遛狗 20:00；Nala · 喂药 20:00；还有 1 项 · 我今晚加班"
	if body != want {
		t.Fatalf("compact family-local batch body: %q", body)
	}
}

func TestBatchActionBodyIncludesAppFallback(t *testing.T) {
	body := batchActionBody(HandoffBatchView{TotalCount: 2})
	if body != "请选你能做的：共 2 项 · 打开 PLANET 处理" {
		t.Fatalf("batch action notification fallback body: %q", body)
	}
}
