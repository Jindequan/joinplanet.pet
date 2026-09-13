package integration

import (
	"net/http"
	"testing"
)

func TestCreateIdempotencyReusesResourcesAndRejectsKeyReuse(t *testing.T) {
	e := NewEnv(t)
	tok, _, familyID, petID := e.SetupFamily("idem", "Milo")

	pet1 := e.doWithHeader("POST", "/api/v1/families/"+familyID+"/pets", tok, map[string]any{
		"name": "Luna", "species": "cat",
	}, "pet-key-001")
	if pet1.Status != http.StatusCreated {
		t.Fatalf("create second pet: %d %v", pet1.Status, pet1.Body)
	}
	pet2 := e.doWithHeader("POST", "/api/v1/families/"+familyID+"/pets", tok, map[string]any{
		"name": "Luna", "species": "cat",
	}, "pet-key-001")
	if pet2.Status != http.StatusCreated || pet1.Body["pet"].(map[string]any)["id"] != pet2.Body["pet"].(map[string]any)["id"] {
		t.Fatalf("idempotent pet retry: %d %v", pet2.Status, pet2.Body)
	}

	first := e.doWithHeader("POST", "/api/v1/pets/"+petID+"/care-plans", tok, map[string]any{
		"type": "medication", "title": "Heart medicine",
		"rule": map[string]any{"type": "daily", "time": "08:00"},
	}, "care-key-001")
	if first.Status != http.StatusCreated {
		t.Fatalf("create care plan: %d %v", first.Status, first.Body)
	}
	second := e.doWithHeader("POST", "/api/v1/pets/"+petID+"/care-plans", tok, map[string]any{
		"type": "medication", "title": "Heart medicine",
		"rule": map[string]any{"type": "daily", "time": "08:00"},
	}, "care-key-001")
	if second.Status != http.StatusCreated {
		t.Fatalf("idempotent care retry: %d %v", second.Status, second.Body)
	}
	if first.Body["care_plan"].(map[string]any)["id"] != second.Body["care_plan"].(map[string]any)["id"] {
		t.Fatalf("idempotent retry created a second care plan: %v / %v", first.Body, second.Body)
	}
	conflict := e.doWithHeader("POST", "/api/v1/pets/"+petID+"/care-plans", tok, map[string]any{
		"type": "medication", "title": "Different medicine",
		"rule": map[string]any{"type": "daily", "time": "08:00"},
	}, "care-key-001")
	if conflict.Status != http.StatusConflict || e.ErrorCode(conflict) != "IDEMPOTENCY_KEY_REUSED" {
		t.Fatalf("different request with same key: %d %v", conflict.Status, conflict.Body)
	}

	shared1 := e.doWithHeader("POST", "/api/v1/pets/"+petID+"/families", tok, map[string]any{
		"family_id": familyID,
	}, "share-key-001")
	shared2 := e.doWithHeader("POST", "/api/v1/pets/"+petID+"/families", tok, map[string]any{
		"family_id": familyID,
	}, "share-key-001")
	if shared1.Status != http.StatusCreated || shared2.Status != http.StatusCreated {
		t.Fatalf("idempotent share retry: %d %v / %d %v", shared1.Status, shared1.Body, shared2.Status, shared2.Body)
	}

	_, delegateID, _ := e.NewUser("delegate")
	grant1 := e.doWithHeader("POST", "/api/v1/pets/"+petID+"/access-grants", tok, map[string]any{
		"user_id": delegateID, "role": "viewer",
	}, "grant-key-001")
	grant2 := e.doWithHeader("POST", "/api/v1/pets/"+petID+"/access-grants", tok, map[string]any{
		"user_id": delegateID, "role": "viewer",
	}, "grant-key-001")
	if grant1.Status != http.StatusCreated || grant2.Status != http.StatusCreated {
		t.Fatalf("idempotent grant retry: %d %v / %d %v", grant1.Status, grant1.Body, grant2.Status, grant2.Body)
	}
}
