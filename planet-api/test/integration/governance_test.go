package integration

import (
	"context"
	"net/http"
	"testing"
	"time"
)

// 所有权移交：目标升 owner、发起者降 caregiver；新 owner 可治理，旧 owner 不行。
func TestOwnershipTransfer(t *testing.T) {
	e := NewEnv(t)
	ownerTok, ownerID, familyID, _ := e.SetupFamily("tr", "Milo")
	cgTok, cgID, _ := e.NewUser("tr-cg")
	ri := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	e.Do("POST", "/api/v1/families/join", cgTok, map[string]any{"code": ri.Body["invite_code"]})

	// 非成员不能被移交 / 自己不能移交给自己
	if r := e.Do("POST", "/api/v1/families/"+familyID+"/transfer", ownerTok,
		map[string]any{"to_user_id": "00000000-0000-0000-0000-000000000000"}); r.Status != http.StatusNotFound {
		t.Fatalf("transfer to non-member: %d", r.Status)
	}
	if r := e.Do("POST", "/api/v1/families/"+familyID+"/transfer", ownerTok,
		map[string]any{"to_user_id": ownerID}); r.Status != http.StatusBadRequest {
		t.Fatalf("transfer to self: %d", r.Status)
	}

	// caregiver 不能发起移交
	if r := e.Do("POST", "/api/v1/families/"+familyID+"/transfer", cgTok,
		map[string]any{"to_user_id": cgID}); r.Status != http.StatusForbidden {
		t.Fatalf("cg initiate transfer: %d", r.Status)
	}

	tr := e.Do("POST", "/api/v1/families/"+familyID+"/transfer", ownerTok,
		map[string]any{"to_user_id": cgID})
	if tr.Status != http.StatusOK {
		t.Fatalf("transfer: %d %v", tr.Status, tr.Body)
	}
	roles := map[string]string{}
	for _, m := range tr.Body["members"].([]any) {
		mm := m.(map[string]any)
		roles[mm["user_id"].(string)] = mm["role"].(string)
	}
	if roles[cgID] != "owner" || roles[ownerID] != "caregiver" {
		t.Fatalf("roles after transfer: %v", roles)
	}

	// 旧 owner 失去治理权，新 owner 获得治理权
	if r := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil); r.Status != http.StatusForbidden {
		t.Fatalf("old owner refresh: %d", r.Status)
	}
	if r := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", cgTok, nil); r.Status != http.StatusOK {
		t.Fatalf("new owner refresh: %d", r.Status)
	}
	// 新 owner（唯一）退出仍被守卫拦截
	if r := e.Do("POST", "/api/v1/families/"+familyID+"/leave", cgTok, nil); r.Status != http.StatusConflict {
		t.Fatalf("last owner leave after transfer: %d", r.Status)
	}
}

// V2 家庭删除：家庭只是 ACL 容器；删除只移除成员/可见关系，宠物与记录继续存在。
func TestFamilyDeleteAndRestore(t *testing.T) {
	e := NewEnv(t)
	// Exercise the restore-slot guard at a one-family boundary. Production's
	// default is three families to support the core multi-family model.
	if _, err := e.Pool.Exec(context.Background(), `UPDATE plans SET owned_families = 1 WHERE key = 'free'`); err != nil {
		t.Fatal(err)
	}
	ownerTok, _, familyID, petID := e.SetupFamily("fd", "Milo")
	cgTok, cgID, _ := e.NewUser("fd-cg")
	ri := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	e.Do("POST", "/api/v1/families/join", cgTok, map[string]any{"code": ri.Body["invite_code"]})

	// 带宠物链接的家庭不可删（409 FAMILY_NOT_EMPTY）——全家的宠物一夜消失
	// 不是删除家庭应有的静默副作用；先解除共享再删。
	r := e.Do("DELETE", "/api/v1/families/"+familyID, ownerTok, map[string]any{"confirm": "fd圈"})
	if r.Status != http.StatusConflict || e.ErrorCode(r) != "FAMILY_NOT_EMPTY" {
		t.Fatalf("delete non-empty family: %d %v", r.Status, r.Body)
	}
	if r := e.Do("DELETE", "/api/v1/pets/"+petID+"/families/"+familyID, ownerTok, nil); r.Status != http.StatusNoContent {
		t.Fatalf("unlink pet before family delete: %d %v", r.Status, r.Body)
	}
	if r := e.Do("DELETE", "/api/v1/families/"+familyID, ownerTok, map[string]any{"confirm": "fd圈"}); r.Status != http.StatusConflict || e.ErrorCode(r) != "FAMILY_NOT_EMPTY" {
		t.Fatalf("delete with active member: %d %v", r.Status, r.Body)
	}
	if r := e.Do("DELETE", "/api/v1/families/"+familyID+"/members/"+cgID, ownerTok, nil); r.Status != http.StatusNoContent {
		t.Fatalf("remove member before family delete: %d %v", r.Status, r.Body)
	}
	if r := e.Do("DELETE", "/api/v1/families/"+familyID, ownerTok, map[string]any{"confirm": "fd圈"}); r.Status != http.StatusNoContent {
		t.Fatalf("delete emptied family: %d %v", r.Status, r.Body)
	}
	// Family 是 ACL 容器；删除只撤销它的成员和可见关系，不影响 Pet 领域对象。
	if r := e.Do("GET", "/api/v1/pets/"+petID, ownerTok, nil); r.Status != http.StatusOK {
		t.Fatalf("pet owner lost data after family delete: %d %v", r.Status, r.Body)
	}
	l := e.Do("GET", "/api/v1/families", ownerTok, nil)
	if families := l.Body["families"].([]any); len(families) != 0 {
		t.Fatalf("deleted family still listed: %v", families)
	}
	if r := e.Do("GET", "/api/v1/families/"+familyID, cgTok, nil); r.Status != http.StatusNotFound {
		t.Fatalf("member access after soft delete: %d", r.Status)
	}
	if r := e.Do("GET", "/api/v1/families/deleted", ownerTok, nil); r.Status != http.StatusOK || len(r.Body["families"].([]any)) != 1 {
		t.Fatalf("deleted Family should be recoverable in app: %d %v", r.Status, r.Body)
	}
	// A deleted Family still occupies the owner's restore slot; creating a new
	// Family must not make the original Family impossible to recover.
	if r := e.Do("POST", "/api/v1/families", ownerTok, map[string]any{"name": "fd-new", "timezone": "Asia/Shanghai"}); r.Status != http.StatusForbidden || e.ErrorCode(r) != "QUOTA_FAMILIES_EXCEEDED" {
		t.Fatalf("deleted family should reserve quota: %d %v", r.Status, r.Body)
	}

	// 非删除者不能恢复；删除者可以
	if r := e.Do("POST", "/api/v1/families/"+familyID+"/restore", cgTok, nil); r.Status != http.StatusNotFound {
		t.Fatalf("non-deleter restore: %d", r.Status)
	}
	if r := e.Do("POST", "/api/v1/families/"+familyID+"/restore", ownerTok, nil); r.Status != http.StatusOK {
		t.Fatalf("restore: %d %v", r.Status, r.Body)
	}
	if r := e.Do("GET", "/api/v1/families/deleted", ownerTok, nil); r.Status != http.StatusOK || len(r.Body["families"].([]any)) != 0 {
		t.Fatalf("restored Family should leave deleted list: %d %v", r.Status, r.Body)
	}
	// Explicitly removed members are not silently restored with the Family;
	// they can join again through a fresh invite if access is still wanted.
	if r := e.Do("GET", "/api/v1/families/"+familyID, cgTok, nil); r.Status != http.StatusNotFound {
		t.Fatalf("removed member should stay out after restore: %d", r.Status)
	}
	reinvite := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	if r := e.Do("POST", "/api/v1/families/join", cgTok, map[string]any{"code": reinvite.Body["invite_code"]}); r.Status != http.StatusOK {
		t.Fatalf("rejoin restored family: %d %v", r.Status, r.Body)
	}
	if r := e.Do("GET", "/api/v1/families/"+familyID, cgTok, nil); r.Status != http.StatusOK {
		t.Fatalf("rejoined member access: %d", r.Status)
	}
}

// Family deletion requires both the pet links and all other active members
// to be cleared; the server must enforce this even when the UI is bypassed.
func TestFamilyDeleteRequiresMembersToBeRemoved(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, familyID, petID := e.SetupFamily("fm", "Milo")
	memberTok, memberID, _ := e.NewUser("fm-member")
	invite := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	e.Do("POST", "/api/v1/families/join", memberTok, map[string]any{"code": invite.Body["invite_code"]})
	if r := e.Do("DELETE", "/api/v1/pets/"+petID+"/families/"+familyID, ownerTok, nil); r.Status != http.StatusNoContent {
		t.Fatalf("unlink pet before member guard: %d %v", r.Status, r.Body)
	}
	if r := e.Do("DELETE", "/api/v1/families/"+familyID, ownerTok, map[string]any{"confirm": "fm圈"}); r.Status != http.StatusConflict || e.ErrorCode(r) != "FAMILY_NOT_EMPTY" {
		t.Fatalf("delete with active member must be blocked: %d %v", r.Status, r.Body)
	}
	if r := e.Do("DELETE", "/api/v1/families/"+familyID+"/members/"+memberID, ownerTok, nil); r.Status != http.StatusNoContent {
		t.Fatalf("remove member: %d %v", r.Status, r.Body)
	}
	if r := e.Do("DELETE", "/api/v1/families/"+familyID, ownerTok, map[string]any{"confirm": "fm圈"}); r.Status != http.StatusNoContent {
		t.Fatalf("delete after clearing members and pets: %d %v", r.Status, r.Body)
	}
}

// 过窗硬删：软删超 30 天 → purge 分层清理后物理删除。
func TestPurgeExpiredFamilies(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, familyID, petID := e.SetupFamily("pg", "Milo")
	created := e.DoJSON("POST", "/api/v1/pets/"+petID+"/care-plans", ownerTok,
		`{"family_id":"`+familyID+`","type":"feeding","title":"清理前的计划","rule":{"type":"daily","time":"08:00"}}`)
	if created.Status != http.StatusCreated {
		t.Fatalf("create family care plan: %d %v", created.Status, created.Body)
	}
	planID := created.Body["care_plan"].(map[string]any)["id"].(string)
	e.Do("DELETE", "/api/v1/pets/"+petID, ownerTok, map[string]any{"confirm": petID})
	e.Do("DELETE", "/api/v1/families/"+familyID, ownerTok, map[string]any{"confirm": "pg圈"})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	// 把 deleted_at 拨到 31 天前，执行与 CLI purge-deleted 相同的事务语义。
	if _, err := e.Pool.Exec(ctx, `
		UPDATE families SET deleted_at = now() - interval '31 days' WHERE id = $1`, familyID); err != nil {
		t.Fatal(err)
	}
	if _, err := e.Pool.Exec(ctx, `
		DELETE FROM care_request_events WHERE request_id IN (
			SELECT id FROM care_requests WHERE family_id = $1
		)`, familyID); err != nil {
		t.Fatal(err)
	}
	if _, err := e.Pool.Exec(ctx, `
		UPDATE care_requests SET supersedes_request_id = NULL
		WHERE supersedes_request_id IN (SELECT id FROM care_requests WHERE family_id = $1)`, familyID); err != nil {
		t.Fatal(err)
	}
	if _, err := e.Pool.Exec(ctx, `
		UPDATE care_requests SET batch_id = NULL WHERE batch_id IN (
			SELECT id FROM care_handoff_batches WHERE family_id = $1
		)`, familyID); err != nil {
		t.Fatal(err)
	}
	if _, err := e.Pool.Exec(ctx, `DELETE FROM care_requests WHERE family_id = $1`, familyID); err != nil {
		t.Fatal(err)
	}
	if _, err := e.Pool.Exec(ctx, `DELETE FROM care_handoff_batches WHERE family_id = $1`, familyID); err != nil {
		t.Fatal(err)
	}
	if _, err := e.Pool.Exec(ctx, `
		UPDATE care_plans SET family_id = NULL, status = 'archived', updated_at = now()
		WHERE family_id = $1 AND deleted_at IS NULL`, familyID); err != nil {
		t.Fatal(err)
	}
	tag, err := e.Pool.Exec(ctx, `
		DELETE FROM families
		WHERE deleted_at IS NOT NULL AND deleted_at < now() - ('30' || ' days')::interval`)
	if err != nil {
		t.Fatal(err)
	}
	if tag.RowsAffected() != 1 {
		t.Fatalf("expected 1 purged family, got %d", tag.RowsAffected())
	}
	var planFamily *string
	var planStatus string
	if err := e.Pool.QueryRow(ctx, `SELECT family_id::text, status FROM care_plans WHERE id = $1`, planID).Scan(&planFamily, &planStatus); err != nil {
		t.Fatal(err)
	}
	if planFamily != nil || planStatus != "archived" {
		t.Fatalf("purged family's plan must keep history without a dead family link: family=%v status=%s", planFamily, planStatus)
	}
	var n int
	if err := e.Pool.QueryRow(ctx,
		`SELECT count(*) FROM families WHERE id = $1`, familyID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatal("family should be physically gone")
	}
	// 恢复应失败（行已不存在）
	if r := e.Do("POST", "/api/v1/families/"+familyID+"/restore", ownerTok, nil); r.Status != http.StatusNotFound {
		t.Fatalf("restore after purge: %d", r.Status)
	}
}

// 拥有家庭数配额：free 支持多个家庭，第三个之后才阻止继续创建。
func TestOwnedFamiliesQuota(t *testing.T) {
	e := NewEnv(t)
	tok, _, firstFamily, _ := e.SetupFamily("of", "Milo")
	_ = firstFamily
	second := e.Do("POST", "/api/v1/families", tok, map[string]any{"name": "第二个家庭"})
	if second.Status != http.StatusCreated {
		t.Fatalf("second owned family should be allowed: %d %v", second.Status, second.Body)
	}
	third := e.Do("POST", "/api/v1/families", tok, map[string]any{"name": "第三个家庭"})
	if third.Status != http.StatusCreated {
		t.Fatalf("third owned family should be allowed: %d %v", third.Status, third.Body)
	}
	r := e.Do("POST", "/api/v1/families", tok, map[string]any{"name": "第四个家庭"})
	if r.Status != http.StatusForbidden || e.ErrorCode(r) != "QUOTA_FAMILIES_EXCEEDED" {
		t.Fatalf("fourth owned family should be blocked: %d %v", r.Status, r.Body)
	}
	// 用量可见
	u := e.Do("GET", "/api/v1/families/"+firstFamily+"/usage", tok, nil)
	if int(u.Body["member_max"].(float64)) != 2 {
		t.Fatalf("usage: %v", u.Body)
	}
}

// petIDOf：圈里第一只宠物（测试助手）。
func (e *Env) petIDOf(t *testing.T, token, familyID string) string {
	t.Helper()
	l := e.Do("GET", "/api/v1/families/"+familyID+"/pets", token, nil)
	if l.Status != http.StatusOK {
		t.Fatalf("list pets: %d", l.Status)
	}
	pets := l.Body["pets"].([]any)
	if len(pets) == 0 {
		t.Fatal("no pets in family")
	}
	return pets[0].(map[string]any)["id"].(string)
}
