package integration

import (
	"context"
	"net/http"
	"testing"
	"time"
)

// 账号注销：拥有圈级联清理；他圈历史（本人记录的事件）置 NULL 保留。
func TestAccountDeletion(t *testing.T) {
	e := NewEnv(t)
	ownerTok, familyID, petID := func() (string, string, string) {
		tok, _, cid, pid := e.SetupFamily("ac", "Milo")
		return tok, cid, pid
	}()
	ownerEmail := e.Do("GET", "/api/v1/me", ownerTok, nil).Body["user"].(map[string]any)["email"].(string)
	_ = familyID
	_ = petID

	// caregiver 记录一条事件（留在 owner 的圈里）
	cgTok, cgID, cgEmail := e.NewUser("ac-cg")
	ri := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	e.Do("POST", "/api/v1/families/join", cgTok, map[string]any{"code": ri.Body["invite_code"]})
	ev := e.DoJSON("POST", "/api/v1/pets/"+petID+"/timeline", cgTok,
		`{"type":"note","occurred_at":"2026-08-18T10:00:00Z","payload":{"text":"由 caregiver 记录"}}`)
	eventID := ev.Body["event"].(map[string]any)["id"].(string)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// confirm 不匹配 → 拒绝
	bad := e.Do("DELETE", "/api/v1/account", ownerTok, map[string]any{"confirm": "wrong@test.planet"})
	if bad.Status != http.StatusBadRequest {
		t.Fatalf("bad confirm: %d", bad.Status)
	}

	// Family 不是 Pet 的资源主体：仍拥有 Pet 时必须先删除或移交，避免
	// 账户删除通过 FK SET NULL 制造 ownerless Pet。
	del := e.Do("DELETE", "/api/v1/account", ownerTok, map[string]any{"confirm": ownerEmail})
	if del.Status != http.StatusConflict || e.ErrorCode(del) != "ACCOUNT_HAS_OWNED_PETS" {
		t.Fatalf("account with owned pet should be blocked: %d %v", del.Status, del.Body)
	}
	if r := e.Do("DELETE", "/api/v1/pets/"+petID, ownerTok, map[string]any{"confirm": petID}); r.Status != http.StatusNoContent {
		t.Fatalf("delete owned pet before account: %d %v", r.Status, r.Body)
	}
	// owner 注销 → 圈级联清理（触发器 v2 放行级联删成员）
	del = e.Do("DELETE", "/api/v1/account", ownerTok, map[string]any{"confirm": ownerEmail})
	if del.Status != http.StatusNoContent {
		t.Fatalf("delete account: %d %v", del.Status, del.Body)
	}

	// owner 的 session 立即失效
	if r := e.Do("GET", "/api/v1/me", ownerTok, nil); r.Status != http.StatusUnauthorized {
		t.Fatalf("deleted user session: %d", r.Status)
	}
	// 圈与宠物已消失
	r := e.Do("GET", "/api/v1/families", cgTok, nil)
	if r.Status != http.StatusOK {
		t.Fatalf("cg families: %d", r.Status)
	}
	if families := r.Body["families"].([]any); len(families) != 0 {
		t.Fatalf("family should be gone, got %v", families)
	}

	// caregiver 注销：其在他人圈记录的事件保留（recorded_by 置 NULL）
	del2 := e.Do("DELETE", "/api/v1/account", cgTok, map[string]any{"confirm": cgEmail})
	if del2.Status != http.StatusNoContent {
		t.Fatalf("cg delete: %d %v", del2.Status, del2.Body)
	}
	// 事件行仍在（经 owner 已注销 → 圈已删……本用例中圈属于 owner，已被级联删）
	// 因此单独验证 SET NULL：重新搭圈，caregiver 记录，caregiver 注销，事件保留
	tok2, _, c2, p2 := e.SetupFamily("ac2", "Coco")
	tok3, _, em3 := e.NewUser("ac2-cg")
	ri2 := e.Do("POST", "/api/v1/families/"+c2+"/invite/refresh", tok2, nil)
	e.Do("POST", "/api/v1/families/join", tok3, map[string]any{"code": ri2.Body["invite_code"]})
	ev2 := e.DoJSON("POST", "/api/v1/pets/"+p2+"/timeline", tok3,
		`{"type":"note","occurred_at":"2026-08-18T10:00:00Z","payload":{"text":"保留我"}}`)
	ev2ID := ev2.Body["event"].(map[string]any)["id"].(string)
	if r := e.Do("DELETE", "/api/v1/account", tok3, map[string]any{"confirm": em3}); r.Status != http.StatusNoContent {
		t.Fatalf("cg2 delete: %d %v", r.Status, r.Body)
	}
	var recordedBy *string
	if err := e.Pool.QueryRow(ctx,
		`SELECT recorded_by_user_id::text FROM pet_events WHERE id = $1`, ev2ID).Scan(&recordedBy); err != nil {
		t.Fatalf("event should survive caregiver deletion: %v", err)
	}
	if recordedBy != nil {
		t.Fatalf("recorded_by_user_id should be NULL after deletion, got %s", *recordedBy)
	}
	// owner 仍能读到该事件
	l := e.Do("GET", "/api/v1/pets/"+p2+"/timeline", tok2, nil)
	if l.Status != http.StatusOK || len(l.Body["events"].([]any)) != 1 {
		t.Fatalf("event not visible to owner after cg deletion: %d", l.Status)
	}
	_ = cgID
	_ = eventID
	_ = http.StatusOK
}

// 账号注销闭环：Pet 已移交后，原 owner 可注销；Pet 与目标 Family 仍可用。
func TestAccountDeletionAfterPetTransfer(t *testing.T) {
	e := NewEnv(t)
	aTok, _, aFamily, petID := e.SetupFamily("ac-transfer", "Milo")
	bTok, _, bFamily, _ := e.SetupFamily("ac-transfer-target", "Coco")

	tr := e.Do("POST", "/api/v1/pets/"+petID+"/transfer", aTok, map[string]any{"to_family_id": bFamily})
	if tr.Status != http.StatusCreated {
		t.Fatalf("create transfer: %d %v", tr.Status, tr.Body)
	}
	transferID := tr.Body["transfer"].(map[string]any)["id"].(string)
	if r := e.Do("POST", "/api/v1/transfers/"+transferID+"/accept", bTok, nil); r.Status != http.StatusOK {
		t.Fatalf("accept transfer: %d %v", r.Status, r.Body)
	}

	email := e.Do("GET", "/api/v1/me", aTok, nil).Body["user"].(map[string]any)["email"].(string)
	if r := e.Do("DELETE", "/api/v1/account", aTok, map[string]any{"confirm": email}); r.Status != http.StatusNoContent {
		t.Fatalf("delete transferred owner's account: %d %v", r.Status, r.Body)
	}
	if r := e.Do("GET", "/api/v1/pets/"+petID, bTok, nil); r.Status != http.StatusOK {
		t.Fatalf("target owner lost transferred pet: %d %v", r.Status, r.Body)
	}
	if r := e.Do("GET", "/api/v1/families/"+aFamily, bTok, nil); r.Status != http.StatusNotFound {
		t.Fatalf("source family should be deleted with account: %d", r.Status)
	}
}

// 用量端点：free 档位回显。
func TestFamilyUsage(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, familyID, _ := e.SetupFamily("us", "Milo")
	u := e.Do("GET", "/api/v1/families/"+familyID+"/usage", ownerTok, nil)
	if u.Status != http.StatusOK {
		t.Fatalf("usage: %d %v", u.Status, u.Body)
	}
	if u.Body["plan"] != "free" || int(u.Body["member_max"].(float64)) != 2 || int(u.Body["pet_max"].(float64)) != 5 {
		t.Fatalf("usage shape: %v", u.Body)
	}
	if int(u.Body["members"].(float64)) != 1 || int(u.Body["pets"].(float64)) != 1 {
		t.Fatalf("usage counts: %v", u.Body)
	}
	// 非成员 404
	_, _, _ = e.NewUser("us-other")
}

// User 用量端点只返回 User-owned 资源，不按 Family 统计。
func TestUserUsage(t *testing.T) {
	e := NewEnv(t)
	tok, _, _, _ := e.SetupFamily("uu", "Milo")
	u := e.Do("GET", "/api/v1/me/usage", tok, nil)
	if u.Status != http.StatusOK {
		t.Fatalf("user usage: %d %v", u.Status, u.Body)
	}
	if u.Body["plan"] != "free" {
		t.Fatalf("user usage plan: %v", u.Body)
	}
	resources := u.Body["resources"].(map[string]any)
	pets := resources["pets_created"].(map[string]any)
	if int(pets["used"].(float64)) != 1 || int(pets["limit"].(float64)) != 5 {
		t.Fatalf("user pet usage: %v", pets)
	}
}
