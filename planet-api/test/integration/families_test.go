package integration

import (
	"net/http"
	"sync"
	"testing"
)

func TestFamiliesLifecycle(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, familyID, _ := e.SetupFamily("lc", "Milo")

	// 邀请码加入
	cgTok, cgID, _ := e.NewUser("lc-cg")
	c := e.Do("GET", "/api/v1/families/"+familyID, ownerTok, nil)
	invite := ""
	if c.Status == http.StatusOK {
		// detail 不含邀请码；用 refresh 取一个
		ri := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
		if ri.Status != http.StatusOK {
			t.Fatalf("refresh invite: %d", ri.Status)
		}
		invite = ri.Body["invite_code"].(string)
	}
	missingKey := e.doWithHeader("POST", "/api/v1/families/join", cgTok, map[string]any{"code": invite}, "")
	if missingKey.Status != http.StatusBadRequest || e.ErrorCode(missingKey) != "VALIDATION_FAILED" {
		t.Fatalf("join without idempotency key: %d %v", missingKey.Status, missingKey.Body)
	}
	j := e.Do("POST", "/api/v1/families/join", cgTok, map[string]any{"code": invite})
	if j.Status != http.StatusOK {
		t.Fatalf("join: %d %v", j.Status, j.Body)
	}
	_ = cgID

	// 重复加入 → 409 ALREADY_MEMBER
	j2 := e.Do("POST", "/api/v1/families/join", cgTok, map[string]any{"code": invite})
	if j2.Status != http.StatusConflict || e.ErrorCode(j2) != "ALREADY_MEMBER" {
		t.Fatalf("dup join: %d %v", j2.Status, j2.Body)
	}

	// free 成员配额 = 2：第三人 → QUOTA_MEMBERS_EXCEEDED
	tok3, _, _ := e.NewUser("lc-3")
	j3 := e.Do("POST", "/api/v1/families/join", tok3, map[string]any{"code": invite})
	if j3.Status != http.StatusForbidden || e.ErrorCode(j3) != "QUOTA_MEMBERS_EXCEEDED" {
		t.Fatalf("member quota: %d %v", j3.Status, j3.Body)
	}

	// caregiver 不能刷新邀请码 / 移除成员
	if r := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", cgTok, nil); r.Status != http.StatusForbidden {
		t.Fatalf("cg refresh should 403: %d", r.Status)
	}
	if r := e.Do("DELETE", "/api/v1/families/"+familyID+"/members/"+cgID, cgTok, nil); r.Status != http.StatusForbidden {
		t.Fatalf("cg remove should 403: %d", r.Status)
	}

	// owner 移除 caregiver → caregiver 立即失去访问
	if r := e.Do("DELETE", "/api/v1/families/"+familyID+"/members/"+cgID, ownerTok, nil); r.Status != http.StatusNoContent {
		t.Fatalf("remove member: %d %v", r.Status, r.Body)
	}
	if r := e.Do("GET", "/api/v1/families/"+familyID, cgTok, nil); r.Status != http.StatusNotFound {
		t.Fatalf("removed member should 404: %d", r.Status)
	}

	// 最后一个 owner 不可被移除/退出
	if r := e.Do("POST", "/api/v1/families/"+familyID+"/leave", ownerTok, nil); r.Status != http.StatusConflict || e.ErrorCode(r) != "LAST_OWNER" {
		t.Fatalf("last owner leave: %d %v", r.Status, r.Body)
	}

	// 非成员访问 → 404（不泄露存在性）
	_, _, otherFamily, _ := e.SetupFamily("lc-other", "Coco")
	if r := e.Do("GET", "/api/v1/families/"+otherFamily, cgTok, nil); r.Status != http.StatusNotFound {
		t.Fatalf("non-member should 404: %d", r.Status)
	}
}

func TestConcurrentJoinQuota(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, familyID, _ := e.SetupFamily("cj", "Milo")
	ri := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	invite := ri.Body["invite_code"].(string)

	var wg sync.WaitGroup
	results := make([]*Resp, 5)
	for i := range results {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			tok, _, _ := e.NewUser("cj-race")
			results[idx] = e.Do("POST", "/api/v1/families/join", tok, map[string]any{"code": invite})
		}(i)
	}
	wg.Wait()
	success := 0
	for _, r := range results {
		if r.Status == http.StatusOK {
			success++
		} else if r.Status != http.StatusForbidden {
			t.Fatalf("unexpected join status: %d %v", r.Status, r.Body)
		}
	}
	if success != 1 {
		t.Fatalf("free family allows exactly 1 caregiver join concurrently, got %d", success)
	}
	d := e.Do("GET", "/api/v1/families/"+familyID, ownerTok, nil)
	members := d.Body["members"].([]any)
	if len(members) != 2 {
		t.Fatalf("expected 2 members, got %d", len(members))
	}
	_ = http.StatusOK
}

func TestInviteRefreshIdempotency(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, familyID, _ := e.SetupFamily("invite-retry", "Milo")
	key := "invite-refresh-retry-1"
	first := e.doWithHeader("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil, key)
	if first.Status != http.StatusOK {
		t.Fatalf("first invite refresh: %d %v", first.Status, first.Body)
	}
	second := e.doWithHeader("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil, key)
	if second.Status != http.StatusOK || second.Body["invite_code"] != first.Body["invite_code"] {
		t.Fatalf("invite refresh replay: first=%d %v second=%d %v", first.Status, first.Body, second.Status, second.Body)
	}
}

// TestInvitePreview：公开预览端点（auth:false）。有效码返回加入权限和 pet_name；无效码 404。
func TestInvitePreview(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, familyID, petID := e.SetupFamily("pv", "Milo")
	ri := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	if ri.Status != http.StatusOK {
		t.Fatalf("refresh invite: %d %v", ri.Status, ri.Body)
	}
	code := ri.Body["invite_code"].(string)

	// 公开、无 token
	prev := e.Do("GET", "/api/v1/invite/"+code, "", nil)
	if prev.Status != http.StatusOK {
		t.Fatalf("invite preview: %d %v", prev.Status, prev.Body)
	}
	if prev.Body["pet_name"] != "Milo" {
		t.Fatalf("expected pet_name Milo, got %v", prev.Body["pet_name"])
	}
	if prev.Body["role"] != "caregiver" {
		t.Fatalf("expected caregiver invite role, got %v", prev.Body["role"])
	}

	// 只查看邀请码的预览必须明确告知受邀人，避免加入后才发现不能参与照护。
	viewerInvite := e.doWithHeader(
		"POST",
		"/api/v1/families/"+familyID+"/invite/refresh",
		ownerTok,
		map[string]any{"role": "viewer"},
		"invite-preview-viewer",
	)
	if viewerInvite.Status != http.StatusOK {
		t.Fatalf("refresh viewer invite: %d %v", viewerInvite.Status, viewerInvite.Body)
	}
	viewerCode := viewerInvite.Body["invite_code"].(string)
	viewerPreview := e.Do("GET", "/api/v1/invite/"+viewerCode, "", nil)
	if viewerPreview.Status != http.StatusOK || viewerPreview.Body["role"] != "viewer" {
		t.Fatalf("expected viewer invite preview, got %d %v", viewerPreview.Status, viewerPreview.Body)
	}

	viewerTok, _, _ := e.NewUser("pv-viewer")
	joinKey := "invite-preview-viewer-join"
	joined := e.doWithHeader(
		"POST",
		"/api/v1/families/join",
		viewerTok,
		map[string]any{"code": viewerCode},
		joinKey,
	)
	if joined.Status != http.StatusOK || joined.Body["family"].(map[string]any)["role"] != "viewer" {
		t.Fatalf("viewer join role: %d %v", joined.Status, joined.Body)
	}
	retried := e.doWithHeader(
		"POST",
		"/api/v1/families/join",
		viewerTok,
		map[string]any{"code": viewerCode},
		joinKey,
	)
	if retried.Status != http.StatusOK || retried.Body["family"].(map[string]any)["role"] != "viewer" {
		t.Fatalf("viewer join replay role: %d %v", retried.Status, retried.Body)
	}

	// 无效/过期码 → 404（不泄露）
	bad := e.Do("GET", "/api/v1/invite/ZZZZZZ", "", nil)
	if bad.Status != http.StatusNotFound {
		t.Fatalf("invalid invite code should 404, got %d %v", bad.Status, bad.Body)
	}
	_ = petID
}
