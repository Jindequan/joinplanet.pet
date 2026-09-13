package integration

import (
	"context"
	"net/http"
	"testing"
	"time"
)

// 配额限额是数据库数据（plans 表）：改行即生效，无需发版。
// 调高 → 立刻可创建；调回 → 存量保留（降级宽限），新增被拒。
func TestQuotaLimitsEditableAtRuntime(t *testing.T) {
	e := NewEnv(t)
	tok, _, familyID, _ := e.SetupFamily("pl", "Milo") // 已占 1 宠

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// 免费档宠物上限 2 → 3
	if _, err := e.Pool.Exec(ctx,
		`UPDATE plans SET active_pets = 3, updated_at = now() WHERE key = 'free'`); err != nil {
		t.Fatal(err)
	}
	p2 := e.Do("POST", "/api/v1/families/"+familyID+"/pets", tok, map[string]any{"name": "Coco", "species": "cat"})
	p3 := e.Do("POST", "/api/v1/families/"+familyID+"/pets", tok, map[string]any{"name": "Nana", "species": "cat"})
	if p2.Status != http.StatusCreated || p3.Status != http.StatusCreated {
		t.Fatalf("raised limit should allow 3 pets: %d %d", p2.Status, p3.Status)
	}

	// 调回 2：存量 3 只保留，新增被拒（宽限：禁新增不删数据）
	if _, err := e.Pool.Exec(ctx,
		`UPDATE plans SET active_pets = 2, updated_at = now() WHERE key = 'free'`); err != nil {
		t.Fatal(err)
	}
	l := e.Do("GET", "/api/v1/families/"+familyID+"/pets", tok, nil)
	if n := len(l.Body["pets"].([]any)); n != 3 {
		t.Fatalf("existing pets must survive downgrade, got %d", n)
	}
	p4 := e.Do("POST", "/api/v1/families/"+familyID+"/pets", tok, map[string]any{"name": "Lulu", "species": "cat"})
	if p4.Status != http.StatusForbidden || e.ErrorCode(p4) != "QUOTA_PETS_EXCEEDED" {
		t.Fatalf("downgrade must block new pets: %d %v", p4.Status, p4.Body)
	}

	// usage 端点回显的是数据库里的当前上限
	u := e.Do("GET", "/api/v1/families/"+familyID+"/usage", tok, nil)
	if int(u.Body["pet_max"].(float64)) != 2 {
		t.Fatalf("usage must reflect DB-edited limit: %v", u.Body)
	}
}
