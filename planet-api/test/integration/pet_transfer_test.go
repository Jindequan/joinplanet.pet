package integration

import (
	"context"
	"net/http"
	"testing"
)

func TestFamilyOwnerCanInitiatePetTransfer(t *testing.T) {
	e := NewEnv(t)
	petOwnerTok, _, sourceFamilyID, petID := e.SetupFamily("pt-governance-source", "Milo")
	targetTok, _, targetFamilyID, _ := e.SetupFamily("pt-governance-target", "Coco")
	familyOwnerTok, familyOwnerID, _ := e.NewUser("pt-governance-owner")

	invite := e.Do("POST", "/api/v1/families/"+sourceFamilyID+"/invite/refresh", petOwnerTok, nil)
	if joined := e.Do("POST", "/api/v1/families/join", familyOwnerTok, map[string]any{"code": invite.Body["invite_code"]}); joined.Status != http.StatusOK {
		t.Fatalf("join source family: %d %v", joined.Status, joined.Body)
	}
	// Make the second user the source-family owner while the original creator
	// remains the Pet's global owner. This is the permission combination that
	// the organization-level transfer action must support.
	if transferred := e.Do("POST", "/api/v1/families/"+sourceFamilyID+"/transfer", petOwnerTok, map[string]any{"to_user_id": familyOwnerID}); transferred.Status != http.StatusOK {
		t.Fatalf("transfer family ownership: %d %v", transferred.Status, transferred.Body)
	}

	created := e.doWithHeader("POST", "/api/v1/pets/"+petID+"/transfer", familyOwnerTok,
		map[string]any{"to_family_id": targetFamilyID}, "family-owner-pet-transfer")
	if created.Status != http.StatusCreated {
		t.Fatalf("family owner should initiate pet transfer: %d %v", created.Status, created.Body)
	}
	transferID := created.Body["transfer"].(map[string]any)["id"].(string)
	if accepted := e.doWithHeader("POST", "/api/v1/transfers/"+transferID+"/accept", targetTok, nil, "family-owner-pet-transfer-accept"); accepted.Status != http.StatusOK {
		t.Fatalf("target owner should accept pet transfer: %d %v", accepted.Status, accepted.Body)
	}
}

func TestRemovingPetFromFamilyClosesFamilyCareWork(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, familyID, petID := e.SetupFamily("unlink-care", "Milo")
	memberTok, memberID, _ := e.NewUser("unlink-care-member")
	invite := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	if joined := e.Do("POST", "/api/v1/families/join", memberTok, map[string]any{"code": invite.Body["invite_code"]}); joined.Status != http.StatusOK {
		t.Fatalf("join family: %d %v", joined.Status, joined.Body)
	}
	created := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok,
		`{"family_id":"`+familyID+`","title":"晚饭喂水","schedule":{"v":1,"kind":"daily"}}`)
	if created.Status != http.StatusCreated {
		t.Fatalf("create family care plan: %d %v", created.Status, created.Body)
	}
	taskID := created.Body["task"].(map[string]any)["id"].(string)
	requested := e.doWithHeader("POST", "/api/v1/care-occurrences/"+taskID+"/requests", ownerTok,
		map[string]any{"family_id": familyID, "target_user_id": memberID, "message": "今晚帮忙吗"}, "unlink-care-request")
	if requested.Status != http.StatusCreated {
		t.Fatalf("create care request: %d %v", requested.Status, requested.Body)
	}
	requestID := requested.Body["care_request"].(map[string]any)["id"].(string)
	if removed := e.Do("DELETE", "/api/v1/families/"+familyID+"/pets/"+petID, ownerTok, nil); removed.Status != http.StatusNoContent {
		t.Fatalf("remove pet from family: %d %v", removed.Status, removed.Body)
	}
	if request := e.Do("GET", "/api/v1/care-requests/"+requestID, ownerTok, nil); request.Status != http.StatusOK || request.Body["care_request"].(map[string]any)["state"] != "cancelled" {
		t.Fatalf("family removal must close open request: %d %v", request.Status, request.Body)
	}
	if today := e.Do("GET", "/api/v1/families/"+familyID+"/today", ownerTok, nil); today.Status != http.StatusOK || len(today.Body["pets"].([]any)) != 0 {
		t.Fatalf("removed pet must leave family Today: %d %v", today.Status, today.Body)
	}
}

// 宠物转移全流程：发起 → 目标 owner 接受 → owner 变更、源 ACL 解除、
// 照护上下文迁移、历史数据保持、旧分享撤销。
func TestPetTransferFlow(t *testing.T) {
	e := NewEnv(t)
	aTok, _, aFamily, petID := e.SetupFamily("pt", "Milo")
	bTok, bID, bFamily, _ := e.SetupFamily("pt-b", "Coco")
	// B is also a caregiver in A for the handoff cancellation assertion. This
	// is a membership relationship, not a Pet sharing relationship.
	invite := e.Do("POST", "/api/v1/families/"+aFamily+"/invite/refresh", aTok, nil)
	if joined := e.Do("POST", "/api/v1/families/join", bTok, map[string]any{"code": invite.Body["invite_code"]}); joined.Status != http.StatusOK {
		t.Fatalf("join source family as caregiver: %d %v", joined.Status, joined.Body)
	}

	// 铺垫：任务 + 用药 + 分享（转移不删除历史数据，但会撤销旧匿名分享凭证）。
	createdTask := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", aTok,
		`{"title":"喂药","schedule":{"v":1,"kind":"daily"}}`)
	if createdTask.Status != http.StatusCreated {
		t.Fatalf("create care plan: %d %v", createdTask.Status, createdTask.Body)
	}
	taskID := createdTask.Body["task"].(map[string]any)["id"].(string)
	requested := e.doWithHeader("POST", "/api/v1/care-occurrences/"+taskID+"/requests", aTok,
		map[string]any{"family_id": aFamily, "target_user_id": bID, "message": "今晚能帮忙吗？"}, "pt-transfer-open-request")
	if requested.Status != http.StatusCreated {
		t.Fatalf("create open care request: %d %v", requested.Status, requested.Body)
	}
	requestID := requested.Body["care_request"].(map[string]any)["id"].(string)
	e.Do("POST", "/api/v1/pets/"+petID+"/medications", aTok, map[string]any{"name": "犬心保"})
	sh := e.Do("POST", "/api/v1/pets/"+petID+"/shares", aTok, map[string]any{"kind": "care_card", "ttl_hours": 24})
	shareToken := sh.Body["token"].(string)

	// 非成员发起 → 404（不泄露宠物存在性，权限语义与所有资源一致）
	cgTok, _, _ := e.NewUser("pt-cg")
	if r := e.Do("POST", "/api/v1/pets/"+petID+"/transfer", cgTok,
		map[string]any{"to_family_id": bFamily}); r.Status != http.StatusNotFound {
		t.Fatalf("non-member initiate should 404: %d", r.Status)
	}
	if r := e.Do("POST", "/api/v1/pets/"+petID+"/transfer", aTok,
		map[string]any{"to_family_id": "00000000-0000-0000-0000-000000000000"}); r.Status != http.StatusNotFound {
		t.Fatalf("unknown target: %d", r.Status)
	}
	if r := e.Do("POST", "/api/v1/pets/"+petID+"/transfer", aTok,
		map[string]any{"to_family_id": aFamily}); r.Status != http.StatusBadRequest {
		t.Fatalf("same-family transfer: %d", r.Status)
	}

	// 发起
	tr := e.Do("POST", "/api/v1/pets/"+petID+"/transfer", aTok, map[string]any{"to_family_id": bFamily})
	if tr.Status != http.StatusCreated {
		t.Fatalf("initiate: %d %v", tr.Status, tr.Body)
	}
	transferID := tr.Body["transfer"].(map[string]any)["id"].(string)
	createdTransfer := tr.Body["transfer"].(map[string]any)
	if createdTransfer["from_family_name"] != "pt圈" || createdTransfer["to_family_name"] != "pt-b圈" {
		t.Fatalf("transfer must include both family names: %v", createdTransfer)
	}

	// 同一宠物重复发起 → 409
	if r := e.Do("POST", "/api/v1/pets/"+petID+"/transfer", aTok,
		map[string]any{"to_family_id": bFamily}); r.Status != http.StatusConflict {
		t.Fatalf("duplicate pending: %d", r.Status)
	}

	// 目标圈的 incoming 列表可见（B owner）；源圈 outgoing 可见
	inb := e.Do("GET", "/api/v1/families/"+bFamily+"/transfers", bTok, nil)
	if inb.Status != http.StatusOK || len(inb.Body["transfers"].([]any)) != 1 {
		t.Fatalf("incoming list: %d %v", inb.Status, inb.Body)
	}
	incomingTransfer := inb.Body["transfers"].([]any)[0].(map[string]any)
	if incomingTransfer["from_family_name"] != "pt圈" || incomingTransfer["to_family_name"] != "pt-b圈" {
		t.Fatalf("incoming transfer must include source and target family names: %v", incomingTransfer)
	}
	outa := e.Do("GET", "/api/v1/families/"+aFamily+"/transfers?direction=outgoing", aTok, nil)
	if len(outa.Body["transfers"].([]any)) != 1 {
		t.Fatalf("outgoing list: %v", outa.Body)
	}

	// A 的 caregiver（非目标圈 owner）不能接受
	if r := e.Do("POST", "/api/v1/transfers/"+transferID+"/accept", cgTok, nil); r.Status != http.StatusForbidden {
		t.Fatalf("non-target accept: %d", r.Status)
	}

	// B（目标圈 owner）接受
	ac := e.Do("POST", "/api/v1/transfers/"+transferID+"/accept", bTok, nil)
	if ac.Status != http.StatusOK || ac.Body["transfer"].(map[string]any)["status"] != "accepted" {
		t.Fatalf("accept: %d %v", ac.Status, ac.Body)
	}

	// 归属断言：B 看得到宠物与任务；A 的 live Family-Pet 关系已解除。
	bPets := e.Do("GET", "/api/v1/families/"+bFamily+"/pets", bTok, nil)
	found := false
	for _, p := range bPets.Body["pets"].([]any) {
		if p.(map[string]any)["id"] == petID {
			found = true
		}
	}
	if !found {
		t.Fatal("pet not in target family after accept")
	}
	bTasks := e.Do("GET", "/api/v1/pets/"+petID+"/tasks", bTok, nil)
	if bTasks.Status != http.StatusOK || len(bTasks.Body["tasks"].([]any)) != 1 {
		t.Fatalf("tasks should follow pet: %d %v", bTasks.Status, bTasks.Body)
	}
	if bTasks.Body["tasks"].([]any)[0].(map[string]any)["family_id"] != bFamily {
		t.Fatalf("care plan should move to target family: %v", bTasks.Body)
	}
	aPets := e.Do("GET", "/api/v1/families/"+aFamily+"/pets", aTok, nil)
	if aPets.Status != http.StatusOK || len(aPets.Body["pets"].([]any)) != 0 {
		t.Fatalf("source family must be empty after transfer: %d %v", aPets.Status, aPets.Body)
	}
	if r := e.Do("GET", "/api/v1/pets/"+petID, aTok, nil); r.Status != http.StatusNotFound {
		t.Fatalf("source family member must lose pet visibility: %d %v", r.Status, r.Body)
	}
	if r := e.Do("GET", "/api/v1/care-requests/"+requestID, bTok, nil); r.Status != http.StatusOK || r.Body["care_request"].(map[string]any)["state"] != "cancelled" {
		t.Fatalf("open handoff must be cancelled during transfer: %d %v", r.Status, r.Body)
	}

	// 旧分享是匿名访问凭证，所有权交接后必须失效。
	if r := e.Do("GET", "/api/v1/shares/"+shareToken, "", nil); r.Status != http.StatusGone {
		t.Fatalf("pet share should be revoked after transfer: %d %v", r.Status, r.Body)
	}

	// auto:transfer 事件在时间线（B 可读，含 from/to）
	ev := e.Do("GET", "/api/v1/pets/"+petID+"/timeline", bTok, nil)
	var hasTransfer bool
	for _, x := range ev.Body["events"].([]any) {
		m := x.(map[string]any)
		if m["type"] == "transfer" && m["source"] == "auto:transfer" {
			hasTransfer = true
			if m["payload"].(map[string]any)["from_family_id"] != aFamily {
				t.Fatal("transfer event payload wrong")
			}
		}
	}
	if !hasTransfer {
		t.Fatalf("auto:transfer event missing: %v", ev.Body)
	}

	// 已接受的转移不可再决
	if r := e.Do("POST", "/api/v1/transfers/"+transferID+"/accept", bTok, nil); r.Status != http.StatusConflict {
		t.Fatalf("double accept: %d", r.Status)
	}

	// 用户不能手写 transfer 类型事件
	if r := e.DoJSON("POST", "/api/v1/pets/"+petID+"/timeline", bTok,
		`{"type":"transfer","occurred_at":"2026-08-18T00:00:00Z","payload":{"from_family_id":"a","to_family_id":"b"}}`); r.Status != http.StatusBadRequest {
		t.Fatalf("user transfer event: %d", r.Status)
	}
}

// 拒绝 / 撤回 / 目标满员。
func TestPetTransferDeclineCancelQuota(t *testing.T) {
	e := NewEnv(t)
	// The transfer target boundary is intentionally tested at two active pets;
	// production's default is five.
	if _, err := e.Pool.Exec(context.Background(), `UPDATE plans SET active_pets = 2 WHERE key = 'free'`); err != nil {
		t.Fatal(err)
	}
	// 目标圈 B 先占满 2 只宠物
	bTok, _, bFamily, _ := e.SetupFamily("td", "B1")
	e.Do("POST", "/api/v1/families/"+bFamily+"/pets", bTok, map[string]any{"name": "B2", "species": "cat"})

	aTok, _, _, petID := e.SetupFamily("td-a", "Milo")

	// decline 路径
	tr := e.Do("POST", "/api/v1/pets/"+petID+"/transfer", aTok, map[string]any{"to_family_id": bFamily})
	id1 := tr.Body["transfer"].(map[string]any)["id"].(string)
	if r := e.Do("POST", "/api/v1/transfers/"+id1+"/decline", bTok, nil); r.Status != http.StatusOK {
		t.Fatalf("decline: %d %v", r.Status, r.Body)
	}
	// 拒绝后可重新发起
	tr2 := e.Do("POST", "/api/v1/pets/"+petID+"/transfer", aTok, map[string]any{"to_family_id": bFamily})
	if tr2.Status != http.StatusCreated {
		t.Fatalf("re-initiate after decline: %d", tr2.Status)
	}
	id2 := tr2.Body["transfer"].(map[string]any)["id"].(string)

	// 发起者撤回
	if r := e.Do("DELETE", "/api/v1/transfers/"+id2, aTok, nil); r.Status != http.StatusNoContent {
		t.Fatalf("cancel: %d", r.Status)
	}

	// 目标满员（free 2 宠）→ accept 403
	tr3 := e.Do("POST", "/api/v1/pets/"+petID+"/transfer", aTok, map[string]any{"to_family_id": bFamily})
	id3 := tr3.Body["transfer"].(map[string]any)["id"].(string)
	r := e.Do("POST", "/api/v1/transfers/"+id3+"/accept", bTok, nil)
	if r.Status != http.StatusForbidden || e.ErrorCode(r) != "QUOTA_PETS_EXCEEDED" {
		t.Fatalf("accept into full family: %d %v", r.Status, r.Body)
	}
	_ = http.StatusOK
}
