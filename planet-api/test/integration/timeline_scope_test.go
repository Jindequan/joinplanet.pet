package integration

import (
	"net/http"
	"testing"
	"time"
)

func TestTimelineRejectsFamilyContextThatDoesNotContainThePet(t *testing.T) {
	e := NewEnv(t)
	tok, _, homeFamilyID, petID := e.SetupFamily("timeline-scope", "Milo")
	otherFamily := e.Do("POST", "/api/v1/families", tok, map[string]any{
		"name":     "timeline-scope-other",
		"timezone": "Asia/Shanghai",
	})
	if otherFamily.Status != http.StatusCreated {
		t.Fatalf("create second family: %d %v", otherFamily.Status, otherFamily.Body)
	}
	otherFamilyID := otherFamily.Body["family"].(map[string]any)["id"].(string)
	occurredAt := time.Now().Add(-time.Hour).UTC().Format(time.RFC3339)

	foreignWrite := e.Do("POST", "/api/v1/pets/"+petID+"/timeline", tok, map[string]any{
		"family_id":   otherFamilyID,
		"type":        "note",
		"occurred_at": occurredAt,
		"payload":     map[string]any{"text": "不应挂到另一个家庭"},
	})
	if foreignWrite.Status != http.StatusBadRequest {
		t.Fatalf("timeline write with unrelated family must be rejected: %d %v", foreignWrite.Status, foreignWrite.Body)
	}

	validWrite := e.Do("POST", "/api/v1/pets/"+petID+"/timeline", tok, map[string]any{
		"family_id":   homeFamilyID,
		"type":        "note",
		"occurred_at": occurredAt,
		"payload":     map[string]any{"text": "家庭内记录"},
	})
	if validWrite.Status != http.StatusCreated {
		t.Fatalf("timeline write with pet family must succeed: %d %v", validWrite.Status, validWrite.Body)
	}
}
