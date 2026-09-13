package timeline

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestValidatePayloadAllowsCompressedPhotoWithinPhotoLimit(t *testing.T) {
	photo := "data:image/jpeg;base64," + strings.Repeat("A", 700<<10)
	payload, err := json.Marshal(map[string]string{"photo_data": photo, "caption": "去公园散步"})
	if err != nil {
		t.Fatalf("marshal photo payload: %v", err)
	}
	if len(payload) <= maxPayloadBytes {
		t.Fatalf("fixture must exceed ordinary payload limit: %d", len(payload))
	}
	if err := ValidatePayload("photo", payload); err != nil {
		t.Fatalf("compressed photo should be accepted: %v", err)
	}
}

func TestValidatePayloadKeepsOrdinaryEventLimit(t *testing.T) {
	payload, err := json.Marshal(map[string]string{"text": strings.Repeat("x", 129<<10)})
	if err != nil {
		t.Fatalf("marshal note payload: %v", err)
	}
	if err := ValidatePayload("note", payload); err == nil {
		t.Fatal("ordinary event payload above 128 KiB must be rejected")
	}
}
