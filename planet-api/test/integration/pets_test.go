package integration

import (
	"context"
	"net/http"
	"sync"
	"testing"
)

func TestPetsBasics(t *testing.T) {
	e := NewEnv(t)
	// Exercise the quota boundary explicitly; production's default allows five
	// active pets so the core multi-pet model is usable.
	if _, err := e.Pool.Exec(context.Background(), `UPDATE plans SET active_pets = 2 WHERE key = 'free'`); err != nil {
		t.Fatal(err)
	}
	ownerTok, _, familyID, petID := e.SetupFamily("pt", "Milo")
	cgTok, cgID, _ := e.NewUser("pt-cg")
	ri := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	e.Do("POST", "/api/v1/families/join", cgTok, map[string]any{"code": ri.Body["invite_code"]})

	// The same Pet response must preserve the member's role at its Family
	// edge. A best-role-only payload would make a viewer look mutable when the
	// Pet is also visible through another Family.
	if r := e.Do("PATCH", "/api/v1/families/"+familyID+"/members/"+cgID, ownerTok, map[string]any{"role": "viewer"}); r.Status != http.StatusNoContent {
		t.Fatalf("set viewer role: %d %v", r.Status, r.Body)
	}
	viewerPet := e.Do("GET", "/api/v1/pets/"+petID, cgTok, nil)
	if viewerPet.Status != http.StatusOK {
		t.Fatalf("viewer pet read: %d %v", viewerPet.Status, viewerPet.Body)
	}
	viewerPayload := viewerPet.Body["pet"].(map[string]any)
	if viewerPayload["access_role"] != "viewer" {
		t.Fatalf("viewer access role missing: %v", viewerPayload)
	}
	familyRoles := viewerPayload["family_roles"].(map[string]any)
	if familyRoles[familyID] != "viewer" {
		t.Fatalf("viewer family role missing: %v", familyRoles)
	}
	if r := e.Do("PATCH", "/api/v1/families/"+familyID+"/members/"+cgID, ownerTok, map[string]any{"role": "caregiver"}); r.Status != http.StatusNoContent {
		t.Fatalf("restore caregiver role: %d %v", r.Status, r.Body)
	}
	// 照护参与权不等于家庭治理权：caregiver 可以执行照护，但不能新增宠物。
	if r := e.Do("POST", "/api/v1/families/"+familyID+"/pets", cgTok, map[string]any{"name": "Not Allowed", "species": "cat"}); r.Status != http.StatusForbidden {
		t.Fatalf("caregiver create pet: %d %v", r.Status, r.Body)
	}

	// 配额：free=2 活跃宠物
	p2 := e.Do("POST", "/api/v1/families/"+familyID+"/pets", ownerTok, map[string]any{"name": "Coco", "species": "cat"})
	if p2.Status != http.StatusCreated {
		t.Fatalf("second pet: %d %v", p2.Status, p2.Body)
	}
	p3 := e.Do("POST", "/api/v1/families/"+familyID+"/pets", ownerTok, map[string]any{"name": "Nana", "species": "other"})
	if p3.Status != http.StatusForbidden || e.ErrorCode(p3) != "QUOTA_PETS_EXCEEDED" {
		t.Fatalf("pet quota: %d %v", p3.Status, p3.Body)
	}

	// caregiver 不能删宠 / 不能归档
	if r := e.Do("DELETE", "/api/v1/pets/"+petID, cgTok, map[string]any{"confirm": petID}); r.Status != http.StatusForbidden {
		t.Fatalf("cg delete pet: %d", r.Status)
	}
	if r := e.Do("POST", "/api/v1/pets/"+petID+"/archive", cgTok, nil); r.Status != http.StatusForbidden {
		t.Fatalf("cg archive pet: %d", r.Status)
	}

	// 归档：只读 + 免配额
	a := e.Do("POST", "/api/v1/pets/"+petID+"/archive", ownerTok, nil)
	if a.Status != http.StatusOK {
		t.Fatalf("archive: %d %v", a.Status, a.Body)
	}
	if r := e.Do("PATCH", "/api/v1/pets/"+petID, ownerTok, map[string]any{"name": "x", "version": 1}); r.Status != http.StatusConflict || e.ErrorCode(r) != "PET_ARCHIVED" {
		t.Fatalf("archived pet write: %d %v", r.Status, r.Body)
	}
	if r := e.Do("GET", "/api/v1/pets/"+petID, ownerTok, nil); r.Status != http.StatusOK {
		t.Fatalf("archived pet read should stay 200: %d", r.Status)
	}
	// 归档后腾出槽位
	p4 := e.Do("POST", "/api/v1/families/"+familyID+"/pets", ownerTok, map[string]any{"name": "Nana", "species": "other"})
	if p4.Status != http.StatusCreated {
		t.Fatalf("archived pet should free quota: %d %v", p4.Status, p4.Body)
	}
	nanaID := p4.Body["pet"].(map[string]any)["id"].(string)

	// 满员时恢复归档 → 配额拒绝
	ua := e.Do("POST", "/api/v1/pets/"+petID+"/unarchive", ownerTok, nil)
	if ua.Status != http.StatusForbidden || e.ErrorCode(ua) != "QUOTA_PETS_EXCEEDED" {
		t.Fatalf("unarchive into full quota: %d %v", ua.Status, ua.Body)
	}
	// 腾位后恢复成功
	if r := e.Do("DELETE", "/api/v1/pets/"+nanaID, ownerTok, map[string]any{"confirm": nanaID}); r.Status != http.StatusNoContent {
		t.Fatalf("delete nana: %d %v", r.Status, r.Body)
	}
	if r := e.Do("POST", "/api/v1/pets/"+petID+"/unarchive", ownerTok, nil); r.Status != http.StatusOK {
		t.Fatalf("unarchive: %d %v", r.Status, r.Body)
	}

	// 乐观锁：并发编辑冲突
	v1 := e.Do("GET", "/api/v1/pets/"+petID, ownerTok, nil)
	version := int(v1.Body["pet"].(map[string]any)["version"].(float64))
	upA := e.Do("PATCH", "/api/v1/pets/"+petID, ownerTok, map[string]any{"name": "MiloA", "version": version})
	if upA.Status != http.StatusOK {
		t.Fatalf("update A: %d %v", upA.Status, upA.Body)
	}
	upB := e.Do("PATCH", "/api/v1/pets/"+petID, cgTok, map[string]any{"name": "MiloB", "version": version})
	if upB.Status != http.StatusForbidden {
		t.Fatalf("caregiver must not edit pet identity: %d %v", upB.Status, upB.Body)
	}

	// 档案更新 + 校验负例
	prof := e.Do("PATCH", "/api/v1/pets/"+petID+"/profile", cgTok, map[string]any{
		"allergies":          []map[string]any{{"name": "鸡肉", "severity": "medium"}},
		"emergency_contacts": []map[string]any{{"name": "Devin", "phone": "13800000000"}},
	})
	if prof.Status != http.StatusForbidden {
		t.Fatalf("caregiver must not edit medical profile: %d %v", prof.Status, prof.Body)
	}
	badProf := e.Do("PATCH", "/api/v1/pets/"+petID+"/profile", ownerTok, map[string]any{
		"emergency_contacts": []map[string]any{{"name": "无电话"}},
	})
	if badProf.Status != http.StatusBadRequest || e.ErrorCode(badProf) != "VALIDATION_FAILED" {
		t.Fatalf("profile validation: %d %v", badProf.Status, badProf.Body)
	}
	_ = cgID
}

func TestFamilyOwnerCanDeleteLinkedPetWithoutGlobalOwnership(t *testing.T) {
	e := NewEnv(t)
	petOwnerTok, _, familyID, petID := e.SetupFamily("pet-lifecycle-family-owner", "Milo")
	familyOwnerTok, familyOwnerID, _ := e.NewUser("pet-lifecycle-family-manager")

	invite := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", petOwnerTok, nil)
	if joined := e.Do("POST", "/api/v1/families/join", familyOwnerTok, map[string]any{"code": invite.Body["invite_code"]}); joined.Status != http.StatusOK {
		t.Fatalf("join family: %d %v", joined.Status, joined.Body)
	}
	if transferred := e.Do("POST", "/api/v1/families/"+familyID+"/transfer", petOwnerTok, map[string]any{"to_user_id": familyOwnerID}); transferred.Status != http.StatusOK {
		t.Fatalf("transfer family ownership: %d %v", transferred.Status, transferred.Body)
	}
	outsiderTok, _, _ := e.NewUser("pet-lifecycle-unrelated-owner")
	if unrelated := e.Do("DELETE", "/api/v1/pets/"+petID, outsiderTok, map[string]any{"confirm": petID}); unrelated.Status != http.StatusNotFound {
		t.Fatalf("unrelated family owner should not see or delete pet: %d %v", unrelated.Status, unrelated.Body)
	}

	if deleted := e.Do("DELETE", "/api/v1/pets/"+petID, familyOwnerTok, map[string]any{"confirm": petID}); deleted.Status != http.StatusNoContent {
		t.Fatalf("family owner should delete linked pet: %d %v", deleted.Status, deleted.Body)
	}
	if visible := e.Do("GET", "/api/v1/pets/"+petID, familyOwnerTok, nil); visible.Status != http.StatusNotFound {
		t.Fatalf("deleted pet should leave family owner's active view: %d %v", visible.Status, visible.Body)
	}
	if recoverable := e.Do("GET", "/api/v1/pets/deleted", petOwnerTok, nil); recoverable.Status != http.StatusOK || len(recoverable.Body["pets"].([]any)) != 1 {
		t.Fatalf("global owner should retain recovery path: %d %v", recoverable.Status, recoverable.Body)
	}
}

func TestConcurrentPetCreateQuota(t *testing.T) {
	e := NewEnv(t)
	if _, err := e.Pool.Exec(context.Background(), `UPDATE plans SET active_pets = 2 WHERE key = 'free'`); err != nil {
		t.Fatal(err)
	}
	ownerTok, _, familyID, _ := e.SetupFamily("pc", "Milo")

	var wg sync.WaitGroup
	results := make([]*Resp, 4)
	for i := range results {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			results[idx] = e.Do("POST", "/api/v1/families/"+familyID+"/pets", ownerTok,
				map[string]any{"name": "Race", "species": "cat"})
		}(i)
	}
	wg.Wait()
	created := 0
	for _, r := range results {
		if r.Status == http.StatusCreated {
			created++
		} else if r.Status != http.StatusForbidden {
			t.Fatalf("unexpected status: %d %v", r.Status, r.Body)
		}
	}
	// 已有 Milo 占 1 槽，并发 4 个创建只允许再成功 1 个
	if created != 1 {
		t.Fatalf("expected exactly 1 concurrent create to succeed, got %d", created)
	}
	l := e.Do("GET", "/api/v1/families/"+familyID+"/pets", ownerTok, nil)
	pets := l.Body["pets"].([]any)
	if len(pets) != 2 {
		t.Fatalf("expected 2 active pets, got %d", len(pets))
	}
	_ = http.StatusOK
}

// TestEmptyFamilyConcurrentPetCreate 覆盖空圈并发建宠超卖漏洞：空圈无宠物行可锁，
// 必须以 family 行 FOR UPDATE 作为串行化点。free 配额 = 2 活跃宠，空圈并发发 4 个，
// 期望至多 2 个成功。
func TestEmptyFamilyConcurrentPetCreate(t *testing.T) {
	e := NewEnv(t)
	if _, err := e.Pool.Exec(context.Background(), `UPDATE plans SET active_pets = 2 WHERE key = 'free'`); err != nil {
		t.Fatal(err)
	}
	tok, _, _ := e.NewUser("ec")
	c := e.Do("POST", "/api/v1/families", tok, map[string]any{"name": "Empty", "timezone": "Asia/Shanghai"})
	if c.Status != http.StatusCreated {
		t.Fatalf("create family: %d %v", c.Status, c.Body)
	}
	familyID := c.Body["family"].(map[string]any)["id"].(string)

	const n = 4 // quota(2) + 2
	var wg sync.WaitGroup
	results := make([]*Resp, n)
	for i := range results {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			results[idx] = e.Do("POST", "/api/v1/families/"+familyID+"/pets", tok,
				map[string]any{"name": "Race", "species": "cat"})
		}(i)
	}
	wg.Wait()
	created := 0
	for _, r := range results {
		if r.Status == http.StatusCreated {
			created++
		} else if r.Status != http.StatusForbidden {
			t.Fatalf("unexpected status: %d %v", r.Status, r.Body)
		}
	}
	if created > 2 {
		t.Fatalf("empty family: expected at most 2 active pets, got %d created", created)
	}
	l := e.Do("GET", "/api/v1/families/"+familyID+"/pets", tok, nil)
	if len(l.Body["pets"].([]any)) != created {
		t.Fatalf("listed pet count mismatch")
	}
}

func TestDeletedPetRestoreLifecycle(t *testing.T) {
	e := NewEnv(t)
	token, _, familyID, petID := e.SetupFamily("restore", "Recoverable")
	if deleted := e.Do("DELETE", "/api/v1/pets/"+petID, token, map[string]any{"confirm": petID}); deleted.Status != http.StatusNoContent {
		t.Fatalf("delete pet: %d %v", deleted.Status, deleted.Body)
	}
	deletedList := e.Do("GET", "/api/v1/pets/deleted", token, nil)
	if deletedList.Status != http.StatusOK {
		t.Fatalf("deleted pet list: %d %v", deletedList.Status, deletedList.Body)
	}
	items := deletedList.Body["pets"].([]any)
	if len(items) != 1 || items[0].(map[string]any)["id"] != petID {
		t.Fatalf("deleted pet missing from recovery list: %v", deletedList.Body)
	}
	if restored := e.Do("POST", "/api/v1/pets/"+petID+"/restore", token, nil); restored.Status != http.StatusOK {
		t.Fatalf("restore pet: %d %v", restored.Status, restored.Body)
	}
	if visible := e.Do("GET", "/api/v1/families/"+familyID+"/pets", token, nil); visible.Status != http.StatusOK || len(visible.Body["pets"].([]any)) != 1 {
		t.Fatalf("restored pet not visible in family: %d %v", visible.Status, visible.Body)
	}
	if deletedAgain := e.Do("GET", "/api/v1/pets/deleted", token, nil); deletedAgain.Status != http.StatusOK || len(deletedAgain.Body["pets"].([]any)) != 0 {
		t.Fatalf("restored pet remains in recovery list: %d %v", deletedAgain.Status, deletedAgain.Body)
	}
}
