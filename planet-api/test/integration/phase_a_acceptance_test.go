package integration

import (
	"net/http"
	"testing"
	"time"
)

// TestPhaseAAcceptancePath mirrors APP foundation flow:
// login → family → pet → care plan → GET /today → care-tasks/complete → timeline visible.
func TestPhaseAAcceptancePath(t *testing.T) {
	e := NewEnv(t)
	token, _, familyID, petID := e.SetupFamily("phase-a", "Milo")

	plan := e.Do("POST", "/api/v1/pets/"+petID+"/care-plans", token, map[string]any{
		"type":        "feeding",
		"title":       "早餐",
		"description": "",
		"rule": map[string]any{
			"type": "daily",
			"time": "08:00",
		},
	})
	if plan.Status != http.StatusCreated {
		t.Fatalf("create care plan: %d %v", plan.Status, plan.Body)
	}
	task, ok := plan.Body["task"].(map[string]any)
	if !ok || task["id"] == nil {
		t.Fatalf("care plan response missing task: %v", plan.Body)
	}
	taskID := task["id"].(string)

	today := e.Do("GET", "/api/v1/today?pet_id="+petID, token, nil)
	if today.Status != http.StatusOK {
		t.Fatalf("today: %d %v", today.Status, today.Body)
	}
	found := false
	for _, pg := range today.Body["pets"].([]any) {
		group := pg.(map[string]any)
		if group["pet_id"] != petID {
			continue
		}
		for _, item := range group["items"].([]any) {
			row := item.(map[string]any)
			careTask := row["task"].(map[string]any)
			if careTask["id"] == taskID && row["log"] == nil {
				found = true
				break
			}
		}
	}
	if !found {
		t.Fatalf("created care task not in today pending list: %v", today.Body)
	}

	complete := e.doWithHeader("POST", "/api/v1/care-tasks/"+taskID+"/complete", token, map[string]any{
		"status": "done",
	}, "phase-a-complete-1")
	if complete.Status != http.StatusCreated {
		t.Fatalf("complete via care-tasks: %d %v", complete.Status, complete.Body)
	}

	timeline := e.Do("GET", "/api/v1/timeline?pet_id="+petID, token, nil)
	if timeline.Status != http.StatusOK {
		t.Fatalf("timeline: %d %v", timeline.Status, timeline.Body)
	}
	events := timeline.Body["events"].([]any)
	if len(events) == 0 {
		t.Fatal("expected care completion on timeline")
	}
	last := events[0].(map[string]any)
	if last["source"] != "auto:care" {
		t.Fatalf("expected auto:care event, got %v", last)
	}
	if last["care_occurrence_id"] != taskID {
		t.Fatalf("timeline event missing care_occurrence_id: %v", last)
	}
	payload := last["payload"].(map[string]any)
	if payload["care_task_id"] != taskID {
		t.Fatalf("timeline event missing care_task_id: %v", payload)
	}

	// Scoped family today still works (APP uses /today with family_id).
	familyToday := e.Do("GET", "/api/v1/today?family_id="+familyID, token, nil)
	if familyToday.Status != http.StatusOK {
		t.Fatalf("family today: %d %v", familyToday.Status, familyToday.Body)
	}

	// A Pet linked to multiple Families must be queryable with an explicit
	// Family edge so the server can use that household's civil timezone.
	petFamilyToday := e.Do("GET", "/api/v1/today?family_id="+familyID+"&pet_id="+petID, token, nil)
	if petFamilyToday.Status != http.StatusOK {
		t.Fatalf("family + pet today: %d %v", petFamilyToday.Status, petFamilyToday.Body)
	}

	// All scope without date: multi-timezone aggregate endpoint.
	allToday := e.Do("GET", "/api/v1/today", token, nil)
	if allToday.Status != http.StatusOK {
		t.Fatalf("all-scope today: %d %v", allToday.Status, allToday.Body)
	}
}

// TestTodayUsesExplicitFamilyTimezoneForSharedPet protects the selected
// Family edge when one Pet is visible from households in different timezones.
// The response date must come from the requested Family, not the Pet's
// primary/default Family or the server's local timezone.
func TestTodayUsesExplicitFamilyTimezoneForSharedPet(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, primaryFamilyID, petID := e.SetupFamily("today-tz-primary", "Milo")
	secondTok, _, selectedFamilyID, _ := e.SetupFamily("today-tz-selected", "Coco")

	invite := e.Do("POST", "/api/v1/families/"+selectedFamilyID+"/invite/refresh", secondTok, nil)
	if invite.Status != http.StatusOK {
		t.Fatalf("refresh invite: %d %v", invite.Status, invite.Body)
	}
	if joined := e.Do("POST", "/api/v1/families/join", ownerTok, map[string]any{"code": invite.Body["invite_code"]}); joined.Status != http.StatusOK {
		t.Fatalf("join selected family: %d %v", joined.Status, joined.Body)
	}
	if linked := e.Do("POST", "/api/v1/pets/"+petID+"/families", ownerTok, map[string]any{"family_id": selectedFamilyID}); linked.Status < 200 || linked.Status > 299 {
		t.Fatalf("link pet to selected family: %d %v", linked.Status, linked.Body)
	}

	// Make the selected edge unmistakably different from the primary edge.
	if changed := e.Do("PATCH", "/api/v1/families/"+primaryFamilyID, ownerTok, map[string]any{"timezone": "Pacific/Honolulu"}); changed.Status != http.StatusOK {
		t.Fatalf("set primary timezone: %d %v", changed.Status, changed.Body)
	}
	if changed := e.Do("PATCH", "/api/v1/families/"+selectedFamilyID, secondTok, map[string]any{"timezone": "Pacific/Kiritimati"}); changed.Status != http.StatusOK {
		t.Fatalf("set selected timezone: %d %v", changed.Status, changed.Body)
	}

	selectedLocation, err := time.LoadLocation("Pacific/Kiritimati")
	if err != nil {
		t.Fatal(err)
	}
	wantDate := time.Now().In(selectedLocation).Format("2006-01-02")
	today := e.Do("GET", "/api/v1/today?family_id="+selectedFamilyID+"&pet_id="+petID, ownerTok, nil)
	if today.Status != http.StatusOK {
		t.Fatalf("selected-family today: %d %v", today.Status, today.Body)
	}
	if got, _ := today.Body["date"].(string); got != wantDate {
		t.Fatalf("selected-family Today must use selected timezone: got %q want %q", got, wantDate)
	}
}
