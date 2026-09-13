package integration

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"
)

// 契约测试：care_card 响应中不得出现任何病史类字段/内容。
// 这是 B7 的核心安全属性（BACKEND-DESIGN §7），用全序列化扫描锁死。
func TestCareCardLeaksNoHistory(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, _, petID := e.SetupFamily("sc", "Milo")

	// 铺垫病史数据：过敏/慢病（profile）+ 事件 + 用药
	e.Do("PATCH", "/api/v1/pets/"+petID+"/profile", ownerTok, map[string]any{
		"allergies":  []map[string]any{{"name": "SECRET_ALLERGEN_X"}},
		"conditions": []map[string]any{{"name": "SECRET_CONDITION_Y"}},
	})
	e.Do("POST", "/api/v1/pets/"+petID+"/medications", ownerTok, map[string]any{"name": "SECRET_MED_Z"})
	e.DoJSON("POST", "/api/v1/pets/"+petID+"/timeline", ownerTok,
		`{"type":"symptom","occurred_at":"2026-08-18T08:00:00Z","payload":{"title":"SECRET_SYMPTOM_W"}}`)

	cr := e.Do("POST", "/api/v1/pets/"+petID+"/shares", ownerTok, map[string]any{
		"kind": "care_card", "ttl_hours": 24,
	})
	if cr.Status != http.StatusCreated {
		t.Fatalf("create share: %d %v", cr.Status, cr.Body)
	}
	token := cr.Body["token"].(string)

	// 匿名查看（无 token）
	view := e.Do("GET", "/api/v1/shares/"+token, "", nil)
	if view.Status != http.StatusOK {
		t.Fatalf("view: %d %v", view.Status, view.Body)
	}
	raw, _ := json.Marshal(view.Body)
	for _, secret := range []string{
		"SECRET_ALLERGEN_X", "SECRET_CONDITION_Y", "SECRET_MED_Z", "SECRET_SYMPTOM_W",
		"allergies", "conditions", "medications", "events", "timeline",
	} {
		if strings.Contains(string(raw), secret) {
			t.Fatalf("care_card leaked %q: %s", secret, raw)
		}
	}
	// 应包含今日任务与紧急联系人结构
	data := view.Body["data"].(map[string]any)
	if _, ok := data["tasks"]; !ok {
		t.Fatal("care_card missing tasks")
	}
	if _, ok := data["emergency_contacts"]; !ok {
		t.Fatal("care_card missing emergency_contacts")
	}
}

// A Pet can be visible in more than one Family. The public care card must use
// the Pet's primary Family civil day, not the first care rule's timezone (or
// the database array order).
func TestCareCardUsesPrimaryFamilyTimezone(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, primaryFamilyID, petID := e.SetupFamily("share-tz", "Milo")
	secondTok, _, secondFamilyID, _ := e.SetupFamily("share-tz-second", "Coco")

	invite := e.Do("POST", "/api/v1/families/"+secondFamilyID+"/invite/refresh", secondTok, nil)
	if invite.Status != http.StatusOK {
		t.Fatalf("refresh invite: %d %v", invite.Status, invite.Body)
	}
	if joined := e.Do("POST", "/api/v1/families/join", ownerTok, map[string]any{"code": invite.Body["invite_code"]}); joined.Status != http.StatusOK {
		t.Fatalf("join second family: %d %v", joined.Status, joined.Body)
	}
	if linked := e.Do("POST", "/api/v1/pets/"+petID+"/families", ownerTok, map[string]any{"family_id": secondFamilyID}); linked.Status < 200 || linked.Status > 299 {
		t.Fatalf("link pet to second family: %d %v", linked.Status, linked.Body)
	}
	// SetupFamily creates a shared edge; seed the valid post-transfer shape so
	// this regression test has an explicit primary edge to resolve.
	if _, err := e.Pool.Exec(context.Background(), `
		UPDATE family_pet_links SET relationship_type = 'primary'
		WHERE pet_id = $1 AND family_id = $2 AND unlinked_at IS NULL AND deleted_at IS NULL`, petID, primaryFamilyID); err != nil {
		t.Fatalf("seed primary family edge: %v", err)
	}
	if r := e.Do("PATCH", "/api/v1/families/"+primaryFamilyID, ownerTok, map[string]any{"timezone": "America/Los_Angeles"}); r.Status != http.StatusOK {
		t.Fatalf("set primary timezone: %d %v", r.Status, r.Body)
	}
	if r := e.Do("PATCH", "/api/v1/families/"+secondFamilyID, secondTok, map[string]any{"timezone": "Asia/Tokyo"}); r.Status != http.StatusOK {
		t.Fatalf("set secondary timezone: %d %v", r.Status, r.Body)
	}

	// Put the only care rule on the secondary edge so the old implementation
	// would derive the share date from Tokyo instead of the primary Family.
	created := e.DoJSON("POST", "/api/v1/pets/"+petID+"/care-plans", ownerTok,
		`{"family_id":"`+secondFamilyID+`","type":"custom","title":"散步","rule":{"type":"daily","time":"09:00"}}`)
	if created.Status != http.StatusCreated {
		t.Fatalf("create secondary-family care plan: %d %v", created.Status, created.Body)
	}

	share := e.Do("POST", "/api/v1/pets/"+petID+"/shares", ownerTok, map[string]any{
		"kind": "care_card", "ttl_hours": 24,
	})
	if share.Status != http.StatusCreated {
		t.Fatalf("create care card: %d %v", share.Status, share.Body)
	}
	view := e.Do("GET", "/api/v1/shares/"+share.Body["token"].(string), "", nil)
	if view.Status != http.StatusOK {
		t.Fatalf("view care card: %d %v", view.Status, view.Body)
	}
	data := view.Body["data"].(map[string]any)
	loc, err := time.LoadLocation("America/Los_Angeles")
	if err != nil {
		t.Fatal(err)
	}
	want := time.Now().In(loc).Format("2006-01-02")
	if got := data["date"]; got != want {
		t.Fatalf("care card must use primary Family date: got %v want %s", got, want)
	}
}

func TestShareLifecycle(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, familyID, petID := e.SetupFamily("sl", "Milo")
	cgTok, cgID, _ := e.NewUser("sl-cg")
	ri := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	e.Do("POST", "/api/v1/families/join", cgTok, map[string]any{"code": ri.Body["invite_code"]})

	// caregiver 不能创建分享
	if r := e.Do("POST", "/api/v1/pets/"+petID+"/shares", cgTok,
		map[string]any{"kind": "care_card", "ttl_hours": 24}); r.Status != http.StatusForbidden {
		t.Fatalf("cg create share: %d", r.Status)
	}

	// 非法 kind / ttl
	if r := e.Do("POST", "/api/v1/pets/"+petID+"/shares", ownerTok,
		map[string]any{"kind": "everything", "ttl_hours": 24}); r.Status != http.StatusBadRequest {
		t.Fatalf("bad kind: %d", r.Status)
	}
	if r := e.Do("POST", "/api/v1/pets/"+petID+"/shares", ownerTok,
		map[string]any{"kind": "summary", "ttl_hours": 48}); r.Status != http.StatusBadRequest {
		t.Fatalf("bad ttl: %d", r.Status)
	}

	// summary 分享：默认段落含用药与事件
	e.Do("POST", "/api/v1/pets/"+petID+"/medications", ownerTok, map[string]any{"name": "犬心保"})
	photoEvent := e.Do("POST", "/api/v1/pets/"+petID+"/timeline", ownerTok, map[string]any{
		"type": "photo", "occurred_at": "2026-08-18T10:00:00Z",
		"payload": map[string]any{
			"photo_data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
			"caption":    "去公园散步",
		},
	})
	if photoEvent.Status != http.StatusCreated {
		t.Fatalf("photo for summary: %d %v", photoEvent.Status, photoEvent.Body)
	}
	eventsShare := e.Do("POST", "/api/v1/pets/"+petID+"/shares", ownerTok, map[string]any{
		"kind": "summary", "ttl_hours": 72,
		"options": map[string]any{"sections": []string{"events"}, "days": 30},
	})
	if eventsShare.Status != http.StatusCreated {
		t.Fatalf("events summary create: %d %v", eventsShare.Status, eventsShare.Body)
	}
	eventsView := e.Do("GET", "/api/v1/shares/"+eventsShare.Body["token"].(string), "", nil)
	if eventsView.Status != http.StatusOK {
		t.Fatalf("events summary view: %d %v", eventsView.Status, eventsView.Body)
	}
	eventsData := eventsView.Body["data"].(map[string]any)
	eventsList, ok := eventsData["events"].([]any)
	foundPhoto := false
	if ok {
		for _, raw := range eventsList {
			if event, ok := raw.(map[string]any); ok && event["type"] == "photo" {
				foundPhoto = true
				break
			}
		}
	}
	if !foundPhoto {
		t.Fatalf("events summary must include the photo event: %v", eventsData)
	}
	sr := e.Do("POST", "/api/v1/pets/"+petID+"/shares", ownerTok, map[string]any{
		"kind": "summary", "ttl_hours": 72,
		"options": map[string]any{"sections": []string{"medications"}, "days": 30},
	})
	if sr.Status != http.StatusCreated {
		t.Fatalf("summary create: %d %v", sr.Status, sr.Body)
	}
	sToken := sr.Body["token"].(string)
	sv := e.Do("GET", "/api/v1/shares/"+sToken, "", nil)
	if sv.Status != http.StatusOK {
		t.Fatalf("summary view: %d", sv.Status)
	}
	sData := sv.Body["data"].(map[string]any)
	if _, ok := sData["medications"].([]any); !ok {
		t.Fatalf("summary missing medications: %v", sData)
	}
	if _, ok := sData["events"]; ok {
		t.Fatal("summary leaked unselected events section")
	}

	// 撤销 → 立即 410；重复撤销幂等
	shareID := sr.Body["share"].(map[string]any)["id"].(string)
	if r := e.Do("DELETE", "/api/v1/shares/"+shareID, ownerTok, nil); r.Status != http.StatusNoContent {
		t.Fatalf("revoke: %d", r.Status)
	}
	if r := e.Do("DELETE", "/api/v1/shares/"+shareID, ownerTok, nil); r.Status != http.StatusNoContent {
		t.Fatalf("revoke idempotent: %d", r.Status)
	}
	if r := e.Do("GET", "/api/v1/shares/"+sToken, "", nil); r.Status != http.StatusGone || e.ErrorCode(r) != "SHARE_GONE" {
		t.Fatalf("revoked view: %d %v", r.Status, r.Body)
	}
	activeAfterRevoke := e.Do("GET", "/api/v1/pets/"+petID+"/shares", ownerTok, nil)
	if activeAfterRevoke.Status != http.StatusOK {
		t.Fatalf("list shares after revoke: %d %v", activeAfterRevoke.Status, activeAfterRevoke.Body)
	}
	for _, raw := range activeAfterRevoke.Body["shares"].([]any) {
		if raw.(map[string]any)["id"] == shareID {
			t.Fatal("revoked share must not remain in the active share list")
		}
	}
	audit := e.Do("GET", "/api/v1/families/"+familyID+"/audit-records", ownerTok, nil)
	if audit.Status != http.StatusOK {
		t.Fatalf("family audit after share lifecycle: %d %v", audit.Status, audit.Body)
	}
	seenCreated, seenRevoked := false, false
	for _, raw := range audit.Body["records"].([]any) {
		record, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		switch record["action"] {
		case "share_created":
			seenCreated = true
		case "share_revoked":
			seenRevoked = true
		}
	}
	if !seenCreated || !seenRevoked {
		t.Fatalf("share lifecycle must be visible in family audit: created=%v revoked=%v records=%v", seenCreated, seenRevoked, audit.Body["records"])
	}

	// 过期 → 410（SQL 把过期时间改到过去）
	cr := e.Do("POST", "/api/v1/pets/"+petID+"/shares", ownerTok, map[string]any{
		"kind": "care_card", "ttl_hours": 24,
	})
	cToken := cr.Body["token"].(string)
	cID := cr.Body["share"].(map[string]any)["id"].(string)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := e.Pool.Exec(ctx,
		`UPDATE share_links SET expires_at = now() - interval '1 hour' WHERE id = $1`, cID); err != nil {
		t.Fatal(err)
	}
	if r := e.Do("GET", "/api/v1/shares/"+cToken, "", nil); r.Status != http.StatusGone {
		t.Fatalf("expired view: %d", r.Status)
	}
	activeAfterExpiry := e.Do("GET", "/api/v1/pets/"+petID+"/shares", ownerTok, nil)
	if activeAfterExpiry.Status != http.StatusOK {
		t.Fatalf("list shares after expiry: %d %v", activeAfterExpiry.Status, activeAfterExpiry.Body)
	}
	for _, raw := range activeAfterExpiry.Body["shares"].([]any) {
		if raw.(map[string]any)["id"] == cID {
			t.Fatal("expired share must not remain in the active share list")
		}
	}

	// view_count 统计 + 列表（owner 可见，无 token 回显）
	cr2 := e.Do("POST", "/api/v1/pets/"+petID+"/shares", ownerTok, map[string]any{
		"kind": "care_card", "ttl_hours": 168,
	})
	t2 := cr2.Body["token"].(string)
	e.Do("GET", "/api/v1/shares/"+t2, "", nil)
	e.Do("GET", "/api/v1/shares/"+t2, "", nil)
	l := e.Do("GET", "/api/v1/pets/"+petID+"/shares", ownerTok, nil)
	if l.Status != http.StatusOK {
		t.Fatalf("list shares: %d", l.Status)
	}
	shares := l.Body["shares"].([]any)
	found := false
	for _, s := range shares {
		m := s.(map[string]any)
		if m["id"] == cr2.Body["share"].(map[string]any)["id"] {
			found = true
			if int(m["view_count"].(float64)) < 2 {
				t.Fatalf("view_count not tracked: %v", m)
			}
			if _, hasToken := m["token"]; hasToken {
				t.Fatal("share list must not return token")
			}
		}
	}
	if !found {
		t.Fatal("created share missing from list")
	}

	// 归档宠：不可新建分享
	e.Do("POST", "/api/v1/pets/"+petID+"/archive", ownerTok, nil)
	if r := e.Do("POST", "/api/v1/pets/"+petID+"/shares", ownerTok,
		map[string]any{"kind": "care_card", "ttl_hours": 24}); r.Status != http.StatusConflict || e.ErrorCode(r) != "PET_ARCHIVED" {
		t.Fatalf("archived pet share create: %d %v", r.Status, r.Body)
	}
	_ = cgID
}
