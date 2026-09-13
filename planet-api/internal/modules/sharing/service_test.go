package sharing

import (
	"encoding/json"
	"testing"
)

func TestSharedEventPayloadPhotoRequiresExplicitOptIn(t *testing.T) {
	payload := json.RawMessage(`{"photo_data":"data:image/jpeg;base64,secret","caption":"去公园"}`)
	withoutPhoto := sharedEventPayload(payload, false)
	withPhoto := sharedEventPayload(payload, true)

	if string(withoutPhoto) == string(payload) {
		t.Fatal("photo payload was not sanitized")
	}
	var sanitized map[string]any
	if err := json.Unmarshal(withoutPhoto, &sanitized); err != nil {
		t.Fatalf("sanitized payload is invalid JSON: %v", err)
	}
	if _, ok := sanitized["photo_data"]; ok {
		t.Fatal("photo_data leaked without explicit opt-in")
	}
	if _, ok := sanitized["caption"]; !ok {
		t.Fatal("caption should remain visible in a photo-free summary")
	}
	if string(withPhoto) != string(payload) {
		t.Fatalf("opt-in payload changed: got %s", withPhoto)
	}
}

func TestSharedEventPayloadFailsClosedOnInvalidPayload(t *testing.T) {
	if got := string(sharedEventPayload(json.RawMessage(`not-json`), false)); got != "{}" {
		t.Fatalf("invalid payload should fail closed, got %s", got)
	}
}
