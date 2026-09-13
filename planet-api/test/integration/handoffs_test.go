package integration

import (
	"net/http"
	"testing"
)

func TestHandoffClaimTransferAndTimeline(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, familyID, petID := e.SetupFamily("ho", "Milo")
	memberTok, memberID, _ := e.NewUser("ho-m")

	ri := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	join := e.Do("POST", "/api/v1/families/join", memberTok, map[string]any{"code": ri.Body["invite_code"]})
	if join.Status != http.StatusOK {
		t.Fatalf("join: %d %v", join.Status, join.Body)
	}

	// Owner claims duty
	c1 := e.doWithHeader("POST", "/api/v1/pets/"+petID+"/handoff", ownerTok, map[string]any{}, "ho-claim-1")
	if c1.Status != http.StatusOK {
		t.Fatalf("claim: %d %v", c1.Status, c1.Body)
	}
	h1 := c1.Body["handoff"].(map[string]any)
	if h1["is_me"] != true {
		t.Fatalf("expected is_me on claim: %v", h1)
	}
	demoteBeforeClaim := e.Do("PATCH", "/api/v1/families/"+familyID+"/members/"+memberID, ownerTok, map[string]any{"role": "viewer"})
	if demoteBeforeClaim.Status != http.StatusNoContent {
		t.Fatalf("demote member before viewer check: %d %v", demoteBeforeClaim.Status, demoteBeforeClaim.Body)
	}
	if denied := e.doWithHeader("POST", "/api/v1/pets/"+petID+"/handoff", memberTok, map[string]any{}, "ho-viewer-claim"); denied.Status != http.StatusForbidden {
		t.Fatalf("viewer must not claim standing responsibility: %d %v", denied.Status, denied.Body)
	}
	restoreBeforeClaim := e.Do("PATCH", "/api/v1/families/"+familyID+"/members/"+memberID, ownerTok, map[string]any{"role": "caregiver"})
	if restoreBeforeClaim.Status != http.StatusNoContent {
		t.Fatalf("restore caregiver before takeover: %d %v", restoreBeforeClaim.Status, restoreBeforeClaim.Body)
	}

	get := e.Do("GET", "/api/v1/pets/"+petID+"/handoff", memberTok, nil)
	if get.Status != http.StatusOK || get.Body["handoff"] == nil {
		t.Fatalf("member should see active handoff: %d %v", get.Status, get.Body)
	}

	// Member takes over with note → timeline note
	c2 := e.doWithHeader("POST", "/api/v1/pets/"+petID+"/handoff", memberTok, map[string]any{
		"note": "今晚我来",
	}, "ho-claim-2")
	if c2.Status != http.StatusOK {
		t.Fatalf("transfer: %d %v", c2.Status, c2.Body)
	}
	h2 := c2.Body["handoff"].(map[string]any)
	if h2["is_me"] != true {
		t.Fatalf("member should be on duty: %v", h2)
	}
	demote := e.Do("PATCH", "/api/v1/families/"+familyID+"/members/"+memberID, ownerTok, map[string]any{"role": "viewer"})
	if demote.Status != http.StatusNoContent {
		t.Fatalf("demote active duty member: %d %v", demote.Status, demote.Body)
	}
	cleared := e.Do("GET", "/api/v1/pets/"+petID+"/handoff", ownerTok, nil)
	if cleared.Status != http.StatusOK || cleared.Body["handoff"] != nil {
		t.Fatalf("demoting active duty member must clear standing responsibility: %d %v", cleared.Status, cleared.Body)
	}
	restore := e.Do("PATCH", "/api/v1/families/"+familyID+"/members/"+memberID, ownerTok, map[string]any{"role": "caregiver"})
	if restore.Status != http.StatusNoContent {
		t.Fatalf("restore caregiver: %d %v", restore.Status, restore.Body)
	}
	c3 := e.doWithHeader("POST", "/api/v1/pets/"+petID+"/handoff", memberTok, map[string]any{"note": "再次负责"}, "ho-claim-3")
	if c3.Status != http.StatusOK {
		t.Fatalf("claim after restore: %d %v", c3.Status, c3.Body)
	}

	tl := e.Do("GET", "/api/v1/timeline?pet_id="+petID, ownerTok, nil)
	events := tl.Body["events"].([]any)
	if len(events) == 0 {
		t.Fatal("expected handoff note on timeline")
	}
	note := events[0].(map[string]any)
	if note["type"] != "note" {
		t.Fatalf("expected note event: %v", note)
	}
	payload := note["payload"].(map[string]any)
	if payload["kind"] != "handoff" {
		t.Fatalf("expected handoff kind: %v", payload)
	}

	sum := e.Do("GET", "/api/v1/families/"+familyID+"/handoff-summary", ownerTok, nil)
	if sum.Status != http.StatusOK {
		t.Fatalf("summary: %d %v", sum.Status, sum.Body)
	}
	pets := sum.Body["pets"].([]any)
	if len(pets) == 0 {
		t.Fatal("summary should list pets")
	}

	formal := e.Do("GET", "/api/v1/families/"+familyID+"/care-responsibility?pet_id="+petID, ownerTok, nil)
	if formal.Status != http.StatusOK {
		t.Fatalf("care responsibility: %d %v", formal.Status, formal.Body)
	}
	if formal.Body["family_id"] != familyID {
		t.Fatalf("care responsibility family id: %v", formal.Body["family_id"])
	}
	formalPets := formal.Body["pets"].([]any)
	if len(formalPets) != 1 {
		t.Fatalf("filtered care responsibility should list one pet: %v", formalPets)
	}
	formalPet := formalPets[0].(map[string]any)
	if formalPet["pet_id"] != petID || formalPet["show_claim"] != true || formalPet["show_release"] != false {
		t.Fatalf("owner should be able to claim while member is on duty: %v", formalPet)
	}

	memberFormal := e.Do("GET", "/api/v1/families/"+familyID+"/care-responsibility?pet_id="+petID, memberTok, nil)
	if memberFormal.Status != http.StatusOK {
		t.Fatalf("member care responsibility: %d %v", memberFormal.Status, memberFormal.Body)
	}
	memberPet := memberFormal.Body["pets"].([]any)[0].(map[string]any)
	if memberPet["show_claim"] != false || memberPet["show_release"] != true {
		t.Fatalf("on-duty member should be offered release: %v", memberPet)
	}

	unknownPet := e.Do("GET", "/api/v1/families/"+familyID+"/care-responsibility?pet_id=00000000-0000-0000-0000-000000000000", ownerTok, nil)
	if unknownPet.Status != http.StatusOK {
		t.Fatalf("unknown pet filter: %d %v", unknownPet.Status, unknownPet.Body)
	}
	if filtered := unknownPet.Body["pets"].([]any); len(filtered) != 0 {
		t.Fatalf("unknown pet must not leak a family pet: %v", filtered)
	}

	rel := e.doWithHeader("POST", "/api/v1/pets/"+petID+"/handoff/release", memberTok, map[string]any{
		"note": "我先下了",
	}, "ho-release-1")
	if rel.Status != http.StatusNoContent {
		t.Fatalf("release: %d %v", rel.Status, rel.Body)
	}
	empty := e.Do("GET", "/api/v1/pets/"+petID+"/handoff", ownerTok, nil)
	if empty.Body["handoff"] != nil {
		t.Fatalf("handoff should be cleared: %v", empty.Body)
	}
}
