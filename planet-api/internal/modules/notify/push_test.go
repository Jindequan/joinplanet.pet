package notify

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestExpoPushSenderIncludesFamilyNotificationContext(t *testing.T) {
	var payload []map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode push payload: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[{"status":"ok","id":"ticket-1"}]`))
	}))
	defer server.Close()

	sender := &ExpoPushSender{Endpoint: server.URL, Client: server.Client()}
	if err := sender.SendData(context.Background(), []string{"ExponentPushToken[test]"}, "PLANET 提醒", "该做事了", map[string]string{
		"kind": "care_reminder",
	}); err != nil {
		t.Fatalf("SendData() error = %v", err)
	}
	if len(payload) != 1 {
		t.Fatalf("got %d push messages, want 1", len(payload))
	}
	if got := payload[0]["channelId"]; got != "care_coordination" {
		t.Fatalf("channelId = %v, want care_coordination", got)
	}
	if got := payload[0]["categoryId"]; got != nil {
		t.Fatalf("ordinary reminder categoryId = %v, want omitted", got)
	}
	data, ok := payload[0]["data"].(map[string]any)
	if !ok || data["kind"] != "care_reminder" {
		t.Fatalf("data = %#v, want care_reminder context", payload[0]["data"])
	}
}

func TestExpoPushSenderAddsActionCategoryForCareRequest(t *testing.T) {
	var payload []map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode push payload: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[{"status":"ok","id":"ticket-1"}]`))
	}))
	defer server.Close()

	sender := &ExpoPushSender{Endpoint: server.URL, Client: server.Client()}
	if err := sender.SendData(context.Background(), []string{"ExponentPushToken[test]"}, "家人请你帮忙", "请选一个处理方式", map[string]string{
		"kind":            "care_request",
		"care_request_id": "request-1",
	}); err != nil {
		t.Fatalf("SendData() error = %v", err)
	}
	if got := payload[0]["categoryId"]; got != "care_request" {
		t.Fatalf("categoryId = %v, want care_request", got)
	}
	if got := payload[0]["threadId"]; got != "request-1" {
		t.Fatalf("threadId = %v, want request-1", got)
	}
}

func TestExpoPushSenderAddsThreadForCareBatch(t *testing.T) {
	var payload []map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode push payload: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[{"status":"ok","id":"ticket-1"}]`))
	}))
	defer server.Close()

	sender := &ExpoPushSender{Endpoint: server.URL, Client: server.Client()}
	if err := sender.SendData(context.Background(), []string{"ExponentPushToken[test]"}, "家人请你帮忙", "请选你能做的", map[string]string{
		"kind":          "care_handoff_batch",
		"care_batch_id": "batch-1",
	}); err != nil {
		t.Fatalf("SendData() error = %v", err)
	}
	if got := payload[0]["categoryId"]; got != "care_handoff_batch" {
		t.Fatalf("categoryId = %v, want care_handoff_batch", got)
	}
	if got := payload[0]["threadId"]; got != "batch-1" {
		t.Fatalf("threadId = %v, want batch-1", got)
	}
}

func TestExpoPushSenderAcceptsExpoEnvelopeResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"status":"ok","id":"ticket-1"}]}`))
	}))
	defer server.Close()

	sender := &ExpoPushSender{Endpoint: server.URL, Client: server.Client()}
	if err := sender.Send(context.Background(), []string{"ExponentPushToken[test]"}, "标题", "内容"); err != nil {
		t.Fatalf("Send() must accept Expo's envelope response: %v", err)
	}
}
