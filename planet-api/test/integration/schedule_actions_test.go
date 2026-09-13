package integration

import (
	"net/http"
	"testing"
)

func TestScheduleActionsSkipMoveSubstitute(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, familyID, petID := e.SetupFamily("sched", "Milo")

	vetR := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok,
		`{"title":"看医生","schedule":{"v":1,"kind":"weekly","days":[1,2,3,4,5,6,7]}}`)
	if vetR.Status != http.StatusCreated {
		t.Fatalf("create vet plan: %d %v", vetR.Status, vetR.Body)
	}
	task := vetR.Body["task"].(map[string]any)
	ruleID := task["care_rule_id"].(string)

	todayR := e.Do("GET", "/api/v1/families/"+familyID+"/today", ownerTok, nil)
	if todayR.Status != http.StatusOK {
		t.Fatalf("today: %d %v", todayR.Status, todayR.Body)
	}
	date := todayR.Body["date"].(string)

	// skip today → absent from Today; replay must return the same override.
	skipPayload := map[string]any{
		"action":  "skip",
		"scope":   "this",
		"slot":    map[string]any{"care_rule_id": ruleID, "date": date},
		"payload": map[string]any{"note": "今天不看医生"},
	}
	skipKey := "schedule-skip-replay"
	skipR := e.doWithHeader("POST", "/api/v1/care-schedule/actions", ownerTok, skipPayload, skipKey)
	if skipR.Status != http.StatusOK {
		t.Fatalf("skip: %d %v", skipR.Status, skipR.Body)
	}
	skipReplay := e.doWithHeader("POST", "/api/v1/care-schedule/actions", ownerTok, skipPayload, skipKey)
	if skipReplay.Status != http.StatusOK || skipReplay.Body["override"] == nil {
		t.Fatalf("replay skip must return the original override: %d %v", skipReplay.Status, skipReplay.Body)
	}
	skipConflict := e.doWithHeader("POST", "/api/v1/care-schedule/actions", ownerTok, map[string]any{
		"action":  "skip",
		"scope":   "this",
		"slot":    map[string]any{"care_rule_id": ruleID, "date": date},
		"payload": map[string]any{"note": "换一个理由"},
	}, skipKey)
	if skipConflict.Status != http.StatusConflict {
		t.Fatalf("reused skip key with different payload must be rejected: %d %v", skipConflict.Status, skipConflict.Body)
	}

	today2 := e.Do("GET", "/api/v1/families/"+familyID+"/today", ownerTok, nil)
	titles := todayTitles(today2)
	if _, ok := titles["看医生"]; ok {
		t.Fatalf("skipped task must not appear: %v", titles)
	}

	// substitute: skip + ad-hoc 去公园
	subR := e.Do("POST", "/api/v1/care-schedule/actions", ownerTok, map[string]any{
		"action": "substitute",
		"scope":  "this",
		"slot":   map[string]any{"care_rule_id": ruleID, "date": date},
		"payload": map[string]any{
			"title":       "去公园",
			"time_of_day": "15:00",
			"note":        "改去公园",
		},
	})
	if subR.Status != http.StatusOK {
		t.Fatalf("substitute: %d %v", subR.Status, subR.Body)
	}
	if subR.Body["task"] == nil {
		t.Fatal("substitute must return replacement task")
	}

	today3 := e.Do("GET", "/api/v1/families/"+familyID+"/today", ownerTok, nil)
	titles3 := todayTitles(today3)
	if _, ok := titles3["去公园"]; !ok {
		t.Fatalf("substitute task missing: %v", titles3)
	}
	if _, ok := titles3["看医生"]; ok {
		t.Fatalf("original must stay skipped: %v", titles3)
	}

	// ad-hoc add
	addPayload := map[string]any{
		"action": "add",
		"scope":  "this",
		"payload": map[string]any{
			"pet_id":      petID,
			"title":       "临时梳毛",
			"date":        date,
			"time_of_day": "20:00",
		},
	}
	addKey := "schedule-add-replay"
	addR := e.doWithHeader("POST", "/api/v1/care-schedule/actions", ownerTok, addPayload, addKey)
	if addR.Status != http.StatusOK {
		t.Fatalf("add: %d %v", addR.Status, addR.Body)
	}
	firstTask := addR.Body["task"].(map[string]any)["id"]
	replayR := e.doWithHeader("POST", "/api/v1/care-schedule/actions", ownerTok, addPayload, addKey)
	if replayR.Status != http.StatusOK {
		t.Fatalf("replay add: %d %v", replayR.Status, replayR.Body)
	}
	if replayTask := replayR.Body["task"].(map[string]any)["id"]; replayTask != firstTask {
		t.Fatalf("replay add must return the original task: first=%v replay=%v", firstTask, replayTask)
	}
	conflicting := map[string]any{
		"action": "add",
		"scope":  "this",
		"payload": map[string]any{
			"pet_id": petID,
			"title":  "另一项",
			"date":   date,
		},
	}
	conflictR := e.doWithHeader("POST", "/api/v1/care-schedule/actions", ownerTok, conflicting, addKey)
	if conflictR.Status != http.StatusConflict {
		t.Fatalf("reused add key with different payload must be rejected: %d %v", conflictR.Status, conflictR.Body)
	}

	// move on a fresh daily task
	feedR := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok,
		`{"title":"喂饭","schedule":{"v":1,"kind":"daily"},"time_of_day":"08:00"}`)
	feedRuleID := feedR.Body["task"].(map[string]any)["care_rule_id"].(string)
	movePayload := map[string]any{
		"action":  "move",
		"scope":   "this",
		"slot":    map[string]any{"care_rule_id": feedRuleID, "date": date},
		"payload": map[string]any{"time_of_day": "19:00"},
	}
	moveKey := "schedule-move-replay"
	moveR := e.doWithHeader("POST", "/api/v1/care-schedule/actions", ownerTok, movePayload, moveKey)
	if moveR.Status != http.StatusOK {
		t.Fatalf("move: %d %v", moveR.Status, moveR.Body)
	}
	moveReplay := e.doWithHeader("POST", "/api/v1/care-schedule/actions", ownerTok, movePayload, moveKey)
	if moveReplay.Status != http.StatusOK || moveReplay.Body["override"] == nil {
		t.Fatalf("replay move must return the original override: %d %v", moveReplay.Status, moveReplay.Body)
	}
}

func TestScheduleSkipClosesOpenCareRequest(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, familyID, petID := e.SetupFamily("sched-request-cancel", "Milo")
	memberTok, memberID, _ := e.NewUser("sched-request-member")

	invite := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	if invite.Status != http.StatusOK {
		t.Fatalf("refresh invite: %d %v", invite.Status, invite.Body)
	}
	if joined := e.Do("POST", "/api/v1/families/join", memberTok, map[string]any{"code": invite.Body["invite_code"]}); joined.Status != http.StatusOK {
		t.Fatalf("join family: %d %v", joined.Status, joined.Body)
	}

	created := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok,
		`{"title":"晚饭后遛狗","schedule":{"v":1,"kind":"daily"}}`)
	if created.Status != http.StatusCreated {
		t.Fatalf("create care plan: %d %v", created.Status, created.Body)
	}
	task := created.Body["task"].(map[string]any)
	taskID := task["id"].(string)
	ruleID := task["care_rule_id"].(string)

	requested := e.doWithHeader("POST", "/api/v1/care-occurrences/"+taskID+"/requests", ownerTok, map[string]any{
		"family_id": familyID, "target_user_id": memberID, "message": "今晚能帮忙遛狗吗？",
	}, "schedule-request-cancel-1")
	if requested.Status != http.StatusCreated {
		t.Fatalf("create care request: %d %v", requested.Status, requested.Body)
	}
	requestID := requested.Body["care_request"].(map[string]any)["id"].(string)

	today := e.Do("GET", "/api/v1/families/"+familyID+"/today", ownerTok, nil)
	if today.Status != http.StatusOK {
		t.Fatalf("today: %d %v", today.Status, today.Body)
	}
	date := today.Body["date"].(string)
	skip := e.doWithHeader("POST", "/api/v1/care-schedule/actions", ownerTok, map[string]any{
		"action": "skip",
		"scope":  "this",
		"slot":   map[string]any{"care_rule_id": ruleID, "date": date},
		"payload": map[string]any{
			"note": "今天不需要遛了",
		},
	}, "schedule-request-cancel-skip")
	if skip.Status != http.StatusOK {
		t.Fatalf("skip: %d %v", skip.Status, skip.Body)
	}

	view := e.Do("GET", "/api/v1/care-requests/"+requestID, memberTok, nil)
	if view.Status != http.StatusOK {
		t.Fatalf("cancelled request detail: %d %v", view.Status, view.Body)
	}
	request := view.Body["care_request"].(map[string]any)
	if request["state"] != "cancelled" {
		t.Fatalf("skipping an occurrence must close its open request: %v", request)
	}

	inbox := e.Do("GET", "/api/v1/care-requests/inbox", memberTok, nil)
	if inbox.Status != http.StatusOK {
		t.Fatalf("member inbox: %d %v", inbox.Status, inbox.Body)
	}
	if items, ok := inbox.Body["care_requests"].([]any); !ok || len(items) != 0 {
		t.Fatalf("cancelled request must leave the open inbox: %v", inbox.Body)
	}
}

func TestPetArchiveClosesOpenCareRequest(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, familyID, petID := e.SetupFamily("pet-request-cancel", "Milo")
	memberTok, memberID, _ := e.NewUser("pet-request-member")

	invite := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	if joined := e.Do("POST", "/api/v1/families/join", memberTok, map[string]any{"code": invite.Body["invite_code"]}); joined.Status != http.StatusOK {
		t.Fatalf("join family: %d %v", joined.Status, joined.Body)
	}
	created := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok,
		`{"title":"晚饭后遛狗","schedule":{"v":1,"kind":"daily"}}`)
	if created.Status != http.StatusCreated {
		t.Fatalf("create care plan: %d %v", created.Status, created.Body)
	}
	taskID := created.Body["task"].(map[string]any)["id"].(string)
	requested := e.doWithHeader("POST", "/api/v1/care-occurrences/"+taskID+"/requests", ownerTok, map[string]any{
		"family_id": familyID, "target_user_id": memberID, "message": "今晚能帮忙遛狗吗？",
	}, "pet-request-cancel-1")
	if requested.Status != http.StatusCreated {
		t.Fatalf("create care request: %d %v", requested.Status, requested.Body)
	}
	requestID := requested.Body["care_request"].(map[string]any)["id"].(string)

	archived := e.Do("POST", "/api/v1/pets/"+petID+"/archive", ownerTok, nil)
	if archived.Status != http.StatusOK {
		t.Fatalf("archive pet: %d %v", archived.Status, archived.Body)
	}
	view := e.Do("GET", "/api/v1/care-requests/"+requestID, memberTok, nil)
	if view.Status != http.StatusOK || view.Body["care_request"].(map[string]any)["state"] != "cancelled" {
		t.Fatalf("archiving a pet must close its open requests: %d %v", view.Status, view.Body)
	}
	inbox := e.Do("GET", "/api/v1/care-requests/inbox", memberTok, nil)
	if inbox.Status != http.StatusOK {
		t.Fatalf("member inbox: %d %v", inbox.Status, inbox.Body)
	}
	if items, ok := inbox.Body["care_requests"].([]any); !ok || len(items) != 0 {
		t.Fatalf("archived pet request must leave the open inbox: %v", inbox.Body)
	}
}

func TestScheduleActionChangeRuleVersion(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, familyID, petID := e.SetupFamily("sched-cr", "Milo")

	created := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok,
		`{"title":"早餐","schedule":{"v":1,"kind":"daily"},"time_of_day":"08:00"}`)
	planID := created.Body["task"].(map[string]any)["care_plan_id"].(string)
	if planID == "" {
		planID = created.Body["task"].(map[string]any)["id"].(string)
	}

	todayR := e.Do("GET", "/api/v1/families/"+familyID+"/today", ownerTok, nil)
	date := todayR.Body["date"].(string)

	changePayload := map[string]any{
		"action": "change_rule",
		"scope":  "from_date",
		"slot":   map[string]any{"care_plan_id": planID},
		"payload": map[string]any{
			"effective_from": date,
			"time_of_day":    "09:00",
			"schedule":       map[string]any{"v": 1, "kind": "daily"},
		},
	}
	changeKey := "schedule-change-rule-replay"
	changeR := e.doWithHeader("POST", "/api/v1/care-schedule/actions", ownerTok, changePayload, changeKey)
	if changeR.Status != http.StatusOK {
		t.Fatalf("change_rule: %d %v", changeR.Status, changeR.Body)
	}
	if changeR.Body["care_rule"] == nil {
		t.Fatal("change_rule must return new care_rule")
	}
	changeReplay := e.doWithHeader("POST", "/api/v1/care-schedule/actions", ownerTok, changePayload, changeKey)
	if changeReplay.Status != http.StatusOK || changeReplay.Body["care_rule"] == nil {
		t.Fatalf("replay change_rule must return the original rule: %d %v", changeReplay.Status, changeReplay.Body)
	}

	clearKey := "schedule-change-rule-clear-time"
	clearPayload := map[string]any{
		"action": "change_rule",
		"scope":  "from_date",
		"slot":   map[string]any{"care_plan_id": planID},
		"payload": map[string]any{
			"effective_from": date,
			"time_of_day":    nil,
			"schedule":       map[string]any{"v": 1, "kind": "daily"},
		},
	}
	clearR := e.doWithHeader("POST", "/api/v1/care-schedule/actions", ownerTok, clearPayload, clearKey)
	if clearR.Status != http.StatusOK {
		t.Fatalf("change_rule clear time: %d %v", clearR.Status, clearR.Body)
	}
	plans := e.Do("GET", "/api/v1/pets/"+petID+"/care-plans", ownerTok, nil)
	if plans.Status != http.StatusOK {
		t.Fatalf("care plans after clear: %d %v", plans.Status, plans.Body)
	}
	for _, raw := range plans.Body["care_plans"].([]any) {
		if plan, ok := raw.(map[string]any); ok && plan["id"] == planID && plan["time_of_day"] != nil {
			t.Fatalf("change_rule null must clear time_of_day, got %v", plan["time_of_day"])
		}
	}
}

func TestScheduleActionAddUsesSelectedFamilyTimezone(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, firstFamilyID, petID := e.SetupFamily("sched-family", "Milo")
	secondTok, _, secondFamilyID, _ := e.SetupFamily("sched-family-second", "Coco")

	inviteR := e.Do("POST", "/api/v1/families/"+secondFamilyID+"/invite/refresh", secondTok, nil)
	inviteCode := inviteR.Body["invite_code"].(string)
	if r := e.Do("POST", "/api/v1/families/join", ownerTok, map[string]any{"code": inviteCode}); r.Status != http.StatusOK {
		t.Fatalf("join second family: %d %v", r.Status, r.Body)
	}
	if r := e.Do("POST", "/api/v1/pets/"+petID+"/families", ownerTok, map[string]any{"family_id": secondFamilyID}); r.Status < 200 || r.Status > 299 {
		t.Fatalf("share pet: %d %v", r.Status, r.Body)
	}
	if r := e.Do("PATCH", "/api/v1/families/"+secondFamilyID, secondTok, map[string]any{"timezone": "Asia/Tokyo"}); r.Status != http.StatusOK {
		t.Fatalf("set second family timezone: %d %v", r.Status, r.Body)
	}
	todayR := e.Do("GET", "/api/v1/families/"+firstFamilyID+"/today", ownerTok, nil)
	date := todayR.Body["date"].(string)

	withoutFamily := e.doWithHeader("POST", "/api/v1/care-schedule/actions", ownerTok, map[string]any{
		"action":  "add",
		"scope":   "this",
		"payload": map[string]any{"pet_id": petID, "title": "多家庭临时照护", "date": date},
	}, "schedule-family-required")
	if withoutFamily.Status != http.StatusBadRequest {
		t.Fatalf("multi-family add without family must be rejected: %d %v", withoutFamily.Status, withoutFamily.Body)
	}

	withFamily := e.doWithHeader("POST", "/api/v1/care-schedule/actions", ownerTok, map[string]any{
		"action": "add",
		"scope":  "this",
		"payload": map[string]any{
			"pet_id":    petID,
			"family_id": secondFamilyID,
			"title":     "东京临时照护",
			"date":      date,
		},
	}, "schedule-family-selected")
	if withFamily.Status != http.StatusOK {
		t.Fatalf("selected-family add: %d %v", withFamily.Status, withFamily.Body)
	}
	task, _ := withFamily.Body["task"].(map[string]any)
	if task["timezone"] != "Asia/Tokyo" {
		t.Fatalf("selected-family add must use selected family timezone: %v", task["timezone"])
	}
}

func TestCreateCarePlanUsesSelectedFamilyTimezone(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, _, petID := e.SetupFamily("plan-family", "Milo")
	secondTok, _, secondFamilyID, _ := e.SetupFamily("plan-family-second", "Coco")
	inviteR := e.Do("POST", "/api/v1/families/"+secondFamilyID+"/invite/refresh", secondTok, nil)
	if r := e.Do("POST", "/api/v1/families/join", ownerTok, map[string]any{"code": inviteR.Body["invite_code"]}); r.Status != http.StatusOK {
		t.Fatalf("join second family: %d %v", r.Status, r.Body)
	}
	if r := e.Do("POST", "/api/v1/pets/"+petID+"/families", ownerTok, map[string]any{"family_id": secondFamilyID}); r.Status < 200 || r.Status > 299 {
		t.Fatalf("share pet: %d %v", r.Status, r.Body)
	}
	if r := e.Do("PATCH", "/api/v1/families/"+secondFamilyID, secondTok, map[string]any{"timezone": "Asia/Tokyo"}); r.Status != http.StatusOK {
		t.Fatalf("set second family timezone: %d %v", r.Status, r.Body)
	}

	withoutFamily := e.Do("POST", "/api/v1/pets/"+petID+"/care-plans", ownerTok, map[string]any{
		"type": "custom", "title": "模糊时区计划", "rule": map[string]any{"type": "daily", "time": "09:00"},
	})
	if withoutFamily.Status != http.StatusBadRequest {
		t.Fatalf("multi-family care plan without family must be rejected: %d %v", withoutFamily.Status, withoutFamily.Body)
	}
	withFamily := e.Do("POST", "/api/v1/pets/"+petID+"/care-plans", ownerTok, map[string]any{
		"family_id": secondFamilyID,
		"type":      "custom",
		"title":     "东京计划",
		"rule":      map[string]any{"type": "daily", "time": "09:00"},
	})
	if withFamily.Status != http.StatusCreated {
		t.Fatalf("selected-family care plan: %d %v", withFamily.Status, withFamily.Body)
	}
	task, _ := withFamily.Body["task"].(map[string]any)
	if task["timezone"] != "Asia/Tokyo" {
		t.Fatalf("selected-family care plan must use selected family timezone: %v", task["timezone"])
	}
}

func todayTitles(todayR *Resp) map[string]bool {
	out := map[string]bool{}
	if todayR.Body == nil {
		return out
	}
	pets, _ := todayR.Body["pets"].([]any)
	for _, pg := range pets {
		items, _ := pg.(map[string]any)["items"].([]any)
		for _, item := range items {
			task := item.(map[string]any)["task"].(map[string]any)
			out[task["title"].(string)] = true
		}
	}
	return out
}
