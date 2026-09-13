package integration

import (
	"context"
	"net/http"
	"sync"
	"testing"
	"time"
)

// 回归：中间件链序 —— CORS 必须在认证之外，预检 OPTIONS 无 token 返回 204。
func TestCORSPreflightBeforeAuth(t *testing.T) {
	e := NewEnv(t)
	req, _ := http.NewRequest(http.MethodOptions, e.baseURL+"/api/v1/families", nil)
	req.Header.Set("Origin", "http://localhost:8082")
	req.Header.Set("Access-Control-Request-Method", "POST")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("preflight without token should be 204, got %d", resp.StatusCode)
	}
	if resp.Header.Get("Access-Control-Allow-Origin") != "http://localhost:8082" {
		// 未配置白名单时不回显（默认无 CORS_ORIGINS），只要不被 401 拦截即可
		t.Log("origin not echoed (allowlist empty) — ok")
	}
}

// 回归：并发移除两个 owner，advisory lock + 触发器必须保证至少留一个。
func TestConcurrentOwnerRemovalKeepsOne(t *testing.T) {
	e := NewEnv(t)
	ownerTok, ownerID, familyID, _ := e.SetupFamily("or", "Milo")
	cgTok, cgID, _ := e.NewUser("or-cg")
	ri := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	e.Do("POST", "/api/v1/families/join", cgTok, map[string]any{"code": ri.Body["invite_code"]})

	// 直接提权第二个 owner（API 暂无此路径，用 SQL 构造双 owner 场景）
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := e.Pool.Exec(ctx,
		`UPDATE family_memberships SET role='owner' WHERE family_id=$1 AND user_id=$2`,
		familyID, cgID); err != nil {
		t.Fatalf("promote: %v", err)
	}

	// 双 owner 并发互相移除
	var wg sync.WaitGroup
	results := make([]*Resp, 2)
	for i, pair := range [2]struct{ actor, target string }{
		{ownerID, cgID}, {cgID, ownerID},
	} {
		wg.Add(1)
		go func(idx int, actor, target string) {
			defer wg.Done()
			var tok string
			if actor == ownerID {
				tok = ownerTok
			} else {
				tok = cgTok
			}
			results[idx] = e.Do("DELETE", "/api/v1/families/"+familyID+"/members/"+target, tok, nil)
		}(i, pair.actor, pair.target)
	}
	wg.Wait()

	var owners int
	if err := e.Pool.QueryRow(ctx, `
		SELECT count(*) FROM family_memberships
		WHERE family_id=$1 AND role='owner' AND status='active' AND ended_at IS NULL AND deleted_at IS NULL`, familyID).Scan(&owners); err != nil {
		t.Fatal(err)
	}
	if owners < 1 {
		t.Fatalf("invariant broken: 0 active owners (results: %d/%d)",
			results[0].Status, results[1].Status)
	}
}

// 回归：/me 返回 entitlements（配额 UI 依赖）。
func TestMeIncludesEntitlements(t *testing.T) {
	e := NewEnv(t)
	tok, _, _ := e.NewUser("me-ent")
	me := e.Do("GET", "/api/v1/me", tok, nil)
	if me.Status != http.StatusOK {
		t.Fatalf("me: %d", me.Status)
	}
	if _, ok := me.Body["entitlements"].([]any); !ok {
		t.Fatalf("me missing entitlements array: %v", me.Body)
	}
}

// 回归：停药日期校验。
func TestMedStopDateValidation(t *testing.T) {
	e := NewEnv(t)
	tok, _, _, petID := e.SetupFamily("ms", "Milo")
	m := e.Do("POST", "/api/v1/pets/"+petID+"/medications", tok, map[string]any{"name": "测试药"})
	medID := m.Body["medication"].(map[string]any)["id"].(string)
	future := time.Now().AddDate(0, 0, 30).Format("2006-01-02")
	r := e.Do("POST", "/api/v1/medications/"+medID+"/stop", tok, map[string]any{"ended_on": future})
	if r.Status != http.StatusBadRequest {
		t.Fatalf("future ended_on should 400, got %d %v", r.Status, r.Body)
	}
}

// 回归：体重唯一写入路径 = weight 事件，PATCH 直改被拒绝。
func TestPetPatchWeightRejected(t *testing.T) {
	e := NewEnv(t)
	tok, _, _, petID := e.SetupFamily("pw", "Milo")
	r := e.Do("PATCH", "/api/v1/pets/"+petID, tok, map[string]any{
		"name": "Milo", "version": 1, "weight_g": 6000,
	})
	if r.Status != http.StatusBadRequest || e.ErrorCode(r) != "VALIDATION_FAILED" {
		t.Fatalf("patch weight_g should 400, got %d %v", r.Status, r.Body)
	}
}

// 回归：伪造 X-Forwarded-For 不能给限流器换 key —— 见 httpx 包的
// TestClientIPTakesRightmost 单元测试（此处仅保留集成层行为回归）。
