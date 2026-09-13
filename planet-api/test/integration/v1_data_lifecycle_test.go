package integration

import (
	"net/http"
	"testing"
)

// TestV1DataLifecycle exercises the fields whose zero values have different
// meanings: omitted means preserve, while an explicit empty value clears.
// It also proves the V1 export is complete enough for a data-only client and
// that the retired attachment/document type is not writable.
func TestV1DataLifecycle(t *testing.T) {
	e := NewEnv(t)
	tok, _, _, petID := e.SetupFamily("v1-lifecycle", "Milo")

	pet := e.Do("GET", "/api/v1/pets/"+petID, tok, nil).Body["pet"].(map[string]any)
	version := int(pet["version"].(float64))
	set := e.Do("PATCH", "/api/v1/pets/"+petID, tok, map[string]any{
		"breed": "Terrier", "sex": "female", "birth_date": "2020-01-02",
		"version": version,
	})
	if set.Status != http.StatusOK {
		t.Fatalf("set optional pet fields: %d %v", set.Status, set.Body)
	}

	pet = set.Body["pet"].(map[string]any)
	cleared := e.Do("PATCH", "/api/v1/pets/"+petID, tok, map[string]any{
		"breed": "", "sex": "", "birth_date": "", "version": int(pet["version"].(float64)),
	})
	if cleared.Status != http.StatusOK {
		t.Fatalf("clear optional pet fields: %d %v", cleared.Status, cleared.Body)
	}
	clearedPet := cleared.Body["pet"].(map[string]any)
	if clearedPet["breed"] != "" || clearedPet["sex"] != "" {
		t.Fatalf("explicit empty fields were not cleared: %v", clearedPet)
	}
	if _, ok := clearedPet["birth_date"]; ok {
		t.Fatalf("explicit empty birth_date was not cleared: %v", clearedPet)
	}

	profile := e.Do("PATCH", "/api/v1/pets/"+petID+"/profile", tok, map[string]any{
		"allergies":          []map[string]any{{"name": "chicken"}},
		"conditions":         []map[string]any{{"name": "arthritis"}},
		"emergency_contacts": []map[string]any{{"name": "Alex", "phone": "123"}},
		"notes":              "keep hydrated",
	})
	if profile.Status != http.StatusOK {
		t.Fatalf("set profile: %d %v", profile.Status, profile.Body)
	}
	profilePatch := e.Do("PATCH", "/api/v1/pets/"+petID+"/profile", tok, map[string]any{
		"allergies": []map[string]any{},
	})
	if profilePatch.Status != http.StatusOK {
		t.Fatalf("partial profile update: %d %v", profilePatch.Status, profilePatch.Body)
	}
	patchedProfile := profilePatch.Body["profile"].(map[string]any)
	if len(patchedProfile["conditions"].([]any)) != 1 || len(patchedProfile["emergency_contacts"].([]any)) != 1 || patchedProfile["notes"] != "keep hydrated" {
		t.Fatalf("omitted profile fields were overwritten: %v", patchedProfile)
	}

	med := e.Do("POST", "/api/v1/pets/"+petID+"/medications", tok, map[string]any{
		"name": "Heartgard", "dose": "1 tablet", "schedule": "monthly", "note": "with food",
	})
	if med.Status != http.StatusCreated {
		t.Fatalf("create medication: %d %v", med.Status, med.Body)
	}
	medID := med.Body["medication"].(map[string]any)["id"].(string)
	medUpdate := e.Do("PATCH", "/api/v1/medications/"+medID, tok, map[string]any{"dose": "2 tablets"})
	if medUpdate.Status != http.StatusOK {
		t.Fatalf("partial medication update: %d %v", medUpdate.Status, medUpdate.Body)
	}
	updatedMed := medUpdate.Body["medication"].(map[string]any)
	if updatedMed["name"] != "Heartgard" || updatedMed["schedule"] != "monthly" || updatedMed["note"] != "with food" {
		t.Fatalf("omitted medication fields were overwritten: %v", updatedMed)
	}
	medClear := e.Do("PATCH", "/api/v1/medications/"+medID, tok, map[string]any{"note": ""})
	if medClear.Status != http.StatusOK || medClear.Body["medication"].(map[string]any)["note"] != "" {
		t.Fatalf("explicit empty medication note was not cleared: %d %v", medClear.Status, medClear.Body)
	}

	task := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", tok,
		`{"title":"Feed","schedule":{"v":1,"kind":"daily"},"time_of_day":"08:30"}`)
	if task.Status != http.StatusCreated {
		t.Fatalf("create task: %d %v", task.Status, task.Body)
	}
	taskID := task.Body["task"].(map[string]any)["id"].(string)
	taskClear := e.Do("PATCH", "/api/v1/tasks/"+taskID, tok, map[string]any{"time_of_day": ""})
	if taskClear.Status != http.StatusOK {
		t.Fatalf("clear task time: %d %v", taskClear.Status, taskClear.Body)
	}
	if _, ok := taskClear.Body["task"].(map[string]any)["time_of_day"]; ok {
		t.Fatalf("explicit empty time_of_day was not cleared: %v", taskClear.Body)
	}

	doc := e.Do("POST", "/api/v1/pets/"+petID+"/timeline", tok, map[string]any{
		"type": "document", "occurred_at": "2026-08-18T08:00:00Z", "payload": map[string]any{"title": "x"},
	})
	if doc.Status != http.StatusBadRequest || e.ErrorCode(doc) != "VALIDATION_FAILED" {
		t.Fatalf("V1 document type must be rejected: %d %v", doc.Status, doc.Body)
	}

	export := e.Do("GET", "/api/v1/pets/"+petID+"/export", tok, nil)
	if export.Status != http.StatusOK {
		t.Fatalf("pet export: %d %v", export.Status, export.Body)
	}
	for _, key := range []string{"export_version", "exported_at", "pet", "profile", "medications", "tasks", "task_logs", "timeline"} {
		if _, ok := export.Body[key]; !ok {
			t.Fatalf("export missing %q: %v", key, export.Body)
		}
	}
	if _, ok := export.Body["token"]; ok {
		t.Fatalf("export must not contain session token")
	}
}
