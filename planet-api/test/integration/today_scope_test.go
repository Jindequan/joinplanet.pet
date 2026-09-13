package integration

import (
	"net/http"
	"testing"
)

func TestTodayKeepsCarePlansInsideTheirFamilyScope(t *testing.T) {
	e := NewEnv(t)
	tok, _, homeFamilyID, petID := e.SetupFamily("today-scope", "Milo")
	otherFamily := e.Do("POST", "/api/v1/families", tok, map[string]any{
		"name":     "today-scope-other",
		"timezone": "Asia/Shanghai",
	})
	if otherFamily.Status != http.StatusCreated {
		t.Fatalf("create second family: %d %v", otherFamily.Status, otherFamily.Body)
	}
	otherFamilyID := otherFamily.Body["family"].(map[string]any)["id"].(string)
	if shared := e.Do("POST", "/api/v1/pets/"+petID+"/families", tok, map[string]any{"family_id": otherFamilyID}); shared.Status != http.StatusCreated {
		t.Fatalf("share pet with second family: %d %v", shared.Status, shared.Body)
	}

	for familyID, title := range map[string]string{
		homeFamilyID:  "家庭 A 的喂食",
		otherFamilyID: "家庭 B 的喂食",
	} {
		created := e.Do("POST", "/api/v1/pets/"+petID+"/care-plans", tok, map[string]any{
			"family_id": familyID,
			"type":      "feeding",
			"title":     title,
			"rule":      map[string]any{"type": "daily", "time": "08:00"},
		})
		if created.Status != http.StatusCreated {
			t.Fatalf("create %s plan: %d %v", familyID, created.Status, created.Body)
		}
	}

	homeToday := e.Do("GET", "/api/v1/families/"+homeFamilyID+"/today", tok, nil)
	if homeToday.Status != http.StatusOK {
		t.Fatalf("home Today: %d %v", homeToday.Status, homeToday.Body)
	}
	if titles := todayTitles(homeToday); !titles["家庭 A 的喂食"] || titles["家庭 B 的喂食"] {
		t.Fatalf("home Today crossed the Family boundary: %v", titles)
	}

	otherToday := e.Do("GET", "/api/v1/families/"+otherFamilyID+"/today", tok, nil)
	if otherToday.Status != http.StatusOK {
		t.Fatalf("other Family Today: %d %v", otherToday.Status, otherToday.Body)
	}
	if titles := todayTitles(otherToday); !titles["家庭 B 的喂食"] || titles["家庭 A 的喂食"] {
		t.Fatalf("other Family Today crossed the Family boundary: %v", titles)
	}

	allToday := e.Do("GET", "/api/v1/today", tok, nil)
	if allToday.Status != http.StatusOK {
		t.Fatalf("All Today: %d %v", allToday.Status, allToday.Body)
	}
	if titles := todayTitles(allToday); !titles["家庭 A 的喂食"] || !titles["家庭 B 的喂食"] {
		t.Fatalf("All Today did not merge both visible Family edges: %v", titles)
	}
}
