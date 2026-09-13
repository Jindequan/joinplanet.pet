package integration

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestMedicationsAutoEvents(t *testing.T) {
	e := NewEnv(t)
	tok, _, familyID, petID := e.SetupFamily("md", "Milo")

	// 建药 → 自动 started 事件
	m := e.Do("POST", "/api/v1/pets/"+petID+"/medications", tok, map[string]any{
		"name": "犬心保", "dose": "68μg", "schedule": "每月 1 次",
	})
	if m.Status != http.StatusCreated {
		t.Fatalf("create med: %d %v", m.Status, m.Body)
	}
	medID := m.Body["medication"].(map[string]any)["id"].(string)

	ev := e.Do("GET", "/api/v1/pets/"+petID+"/timeline", tok, nil)
	events := ev.Body["events"].([]any)
	if len(events) != 1 {
		t.Fatalf("expected 1 auto started event, got %d", len(events))
	}
	first := events[0].(map[string]any)
	if first["type"] != "medication" || first["source"] != "auto:med" {
		t.Fatalf("event shape: %v", first)
	}
	if first["payload"].(map[string]any)["action"] != "started" {
		t.Fatal("expected action=started")
	}
	if first["family_id"] != familyID {
		t.Fatalf("auto event must preserve family context: %v", first)
	}

	// 停药 → ended 事件，且幂等（重复停不产生新事件）
	s := e.Do("POST", "/api/v1/medications/"+medID+"/stop", tok, nil)
	if s.Status != http.StatusOK {
		t.Fatalf("stop: %d %v", s.Status, s.Body)
	}
	s2 := e.Do("POST", "/api/v1/medications/"+medID+"/stop", tok, nil)
	if s2.Status != http.StatusOK {
		t.Fatalf("stop idempotent: %d", s2.Status)
	}
	ev2 := e.Do("GET", "/api/v1/pets/"+petID+"/timeline", tok, nil)
	events2 := ev2.Body["events"].([]any)
	if len(events2) != 2 {
		t.Fatalf("expected exactly started+ended, got %d", len(events2))
	}

	// auto 事件不可删
	autoID := events2[0].(map[string]any)["id"].(string)
	d := e.Do("DELETE", "/api/v1/timeline-events/"+autoID, tok, nil)
	if d.Status != http.StatusConflict || e.ErrorCode(d) != "AUTO_EVENT_IMMUTABLE" {
		t.Fatalf("auto delete: %d %v", d.Status, d.Body)
	}

	// 删药（owner）级联删其 auto 事件
	dm := e.Do("DELETE", "/api/v1/medications/"+medID, tok, nil)
	if dm.Status != http.StatusNoContent {
		t.Fatalf("delete med: %d %v", dm.Status, dm.Body)
	}
	list := e.Do("GET", "/api/v1/pets/"+petID+"/medications", tok, nil)
	if list.Status != http.StatusOK || len(list.Body["medications"].([]any)) != 0 {
		t.Fatalf("soft-deleted medication must be filtered from reads: %d %v", list.Status, list.Body)
	}
	ev3 := e.Do("GET", "/api/v1/pets/"+petID+"/timeline", tok, nil)
	if n := len(ev3.Body["events"].([]any)); n != 0 {
		t.Fatalf("med events should be removed with med, got %d", n)
	}
}

func TestMedicationDatesUseSelectedFamilyTimezone(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, _, petID := e.SetupFamily("med-family", "Milo")
	secondTok, _, secondFamilyID, _ := e.SetupFamily("med-family-second", "Coco")

	invite := e.Do("POST", "/api/v1/families/"+secondFamilyID+"/invite/refresh", secondTok, nil)
	if r := e.Do("POST", "/api/v1/families/join", ownerTok, map[string]any{"code": invite.Body["invite_code"]}); r.Status != http.StatusOK {
		t.Fatalf("join second family: %d %v", r.Status, r.Body)
	}
	if r := e.Do("POST", "/api/v1/pets/"+petID+"/families", ownerTok, map[string]any{"family_id": secondFamilyID}); r.Status < 200 || r.Status > 299 {
		t.Fatalf("share pet: %d %v", r.Status, r.Body)
	}
	if r := e.Do("PATCH", "/api/v1/families/"+secondFamilyID, secondTok, map[string]any{"timezone": "Asia/Tokyo"}); r.Status != http.StatusOK {
		t.Fatalf("set second family timezone: %d %v", r.Status, r.Body)
	}
	_, outsiderID, outsiderFamilyID, _ := e.SetupFamily("med-family-outsider", "Nana")
	if _, err := e.Pool.Exec(context.Background(), `
		INSERT INTO family_pet_links (family_id, pet_id, relationship_type, linked_by_user_id)
		VALUES ($1, $2, 'shared', $3)`, outsiderFamilyID, petID, outsiderID); err != nil {
		t.Fatalf("seed linked outsider family: %v", err)
	}
	outsiderMedication := e.Do("POST", "/api/v1/pets/"+petID+"/medications", ownerTok, map[string]any{
		"family_id": outsiderFamilyID,
		"name":      "越权时区药",
	})
	if outsiderMedication.Status != http.StatusNotFound {
		t.Fatalf("non-member must not select a linked family: %d %v", outsiderMedication.Status, outsiderMedication.Body)
	}

	withoutFamily := e.Do("POST", "/api/v1/pets/"+petID+"/medications", ownerTok, map[string]any{"name": "模糊时区药"})
	if withoutFamily.Status != http.StatusBadRequest {
		t.Fatalf("multi-family medication without family must be rejected: %d %v", withoutFamily.Status, withoutFamily.Body)
	}

	created := e.Do("POST", "/api/v1/pets/"+petID+"/medications", ownerTok, map[string]any{
		"family_id": secondFamilyID,
		"name":      "东京用药",
	})
	if created.Status != http.StatusCreated {
		t.Fatalf("selected-family medication: %d %v", created.Status, created.Body)
	}
	med := created.Body["medication"].(map[string]any)
	if med["started_on"] != time.Now().In(time.FixedZone("JST", 9*60*60)).Format("2006-01-02") {
		t.Fatalf("medication started_on must use selected family date: %v", med["started_on"])
	}
	medID := med["id"].(string)

	withoutStopFamily := e.Do("POST", "/api/v1/medications/"+medID+"/stop", ownerTok, nil)
	if withoutStopFamily.Status != http.StatusBadRequest {
		t.Fatalf("multi-family stop without family must be rejected: %d %v", withoutStopFamily.Status, withoutStopFamily.Body)
	}
	stopped := e.Do("POST", "/api/v1/medications/"+medID+"/stop", ownerTok, map[string]any{
		"family_id": secondFamilyID,
	})
	if stopped.Status != http.StatusOK {
		t.Fatalf("selected-family stop: %d %v", stopped.Status, stopped.Body)
	}
	if stopped.Body["medication"].(map[string]any)["ended_on"] != time.Now().In(time.FixedZone("JST", 9*60*60)).Format("2006-01-02") {
		t.Fatalf("medication ended_on must use selected family date: %v", stopped.Body["medication"])
	}
}

func TestTimelineUserEvents(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, familyID, petID := e.SetupFamily("tl", "Milo")
	cgTok, cgID, _ := e.NewUser("tl-cg")
	c := e.Do("GET", "/api/v1/families/"+e.familyIDOf(ownerTok), ownerTok, nil)
	_ = c
	_ = cgID

	// weight 事件 → 同步更新宠物 weight_g
	w := e.Do("POST", "/api/v1/pets/"+petID+"/timeline", ownerTok, map[string]any{
		"type": "weight", "occurred_at": "2026-08-18T08:00:00Z",
		"payload": map[string]any{"weight_g": 5350},
	})
	if w.Status != http.StatusCreated {
		t.Fatalf("weight event: %d %v", w.Status, w.Body)
	}
	if w.Body["event"].(map[string]any)["family_id"] != familyID {
		t.Fatalf("manual event must preserve family context: %v", w.Body)
	}
	p := e.Do("GET", "/api/v1/pets/"+petID, ownerTok, nil)
	if int(p.Body["pet"].(map[string]any)["weight_g"].(float64)) != 5350 {
		t.Fatalf("pet.weight_g not synced: %v", p.Body["pet"])
	}

	// 非法 payload
	bad := e.Do("POST", "/api/v1/pets/"+petID+"/timeline", ownerTok, map[string]any{
		"type": "weight", "occurred_at": "2026-08-18T08:00:00Z",
		"payload": map[string]any{"weight_g": 0},
	})
	if bad.Status != http.StatusBadRequest {
		t.Fatalf("weight validation: %d", bad.Status)
	}

	// 用户不可直接创建 medication 类型（语义分界 D6）
	bad2 := e.Do("POST", "/api/v1/pets/"+petID+"/timeline", ownerTok, map[string]any{
		"type": "medication", "occurred_at": "2026-08-18T08:00:00Z",
		"payload": map[string]any{},
	})
	if bad2.Status != http.StatusBadRequest {
		t.Fatalf("medication type gate: %d", bad2.Status)
	}

	// 临时事件可以带一张压缩照片；照片仍然是 Pet Event，保留家庭上下文，
	// 时间线读取时由同一条事件查询返回。
	photo := e.Do("POST", "/api/v1/pets/"+petID+"/timeline", ownerTok, map[string]any{
		"type": "photo", "occurred_at": "2026-08-18T10:00:00Z",
		"payload": map[string]any{
			"photo_data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
			"caption":    "去公园散步",
		},
	})
	if photo.Status != http.StatusCreated {
		t.Fatalf("photo event: %d %v", photo.Status, photo.Body)
	}
	photoEvent := photo.Body["event"].(map[string]any)
	if photoEvent["family_id"] != familyID || photoEvent["type"] != "photo" {
		t.Fatalf("photo event must preserve family context: %v", photoEvent)
	}
	photoPayload := photoEvent["payload"].(map[string]any)
	if photoPayload["caption"] != "去公园散步" {
		t.Fatalf("photo caption missing: %v", photoPayload)
	}
	// A normal compressed phone thumbnail is larger than the old 96 KiB
	// ceiling. It must still be a valid single photo event under the 1 MiB
	// JSON request guard.
	largePhoto := e.Do("POST", "/api/v1/pets/"+petID+"/timeline", ownerTok, map[string]any{
		"type": "photo", "occurred_at": "2026-08-18T10:02:00Z",
		"payload": map[string]any{
			"photo_data": "data:image/jpeg;base64," + strings.Repeat("A", 120<<10),
			"caption":    "压缩后的照片",
		},
	})
	if largePhoto.Status != http.StatusCreated {
		t.Fatalf("compressed phone photo above legacy limit: %d %v", largePhoto.Status, largePhoto.Body)
	}
	badPhoto := e.Do("POST", "/api/v1/pets/"+petID+"/timeline", ownerTok, map[string]any{
		"type": "photo", "occurred_at": "2026-08-18T10:01:00Z",
		"payload": map[string]any{"photo_data": "https://example.com/dog.jpg"},
	})
	if badPhoto.Status != http.StatusBadRequest {
		t.Fatalf("remote photo URL must be rejected: %d", badPhoto.Status)
	}
	badPhotoData := e.Do("POST", "/api/v1/pets/"+petID+"/timeline", ownerTok, map[string]any{
		"type": "photo", "occurred_at": "2026-08-18T10:03:00Z",
		"payload": map[string]any{"photo_data": "data:image/jpeg;base64,not-a-photo"},
	})
	if badPhotoData.Status != http.StatusBadRequest {
		t.Fatalf("invalid photo base64 must be rejected: %d", badPhotoData.Status)
	}

	// 自己的事件可删；weight 冗余保持最后写入（删事件不回退体重，可接受）
	n := e.Do("POST", "/api/v1/pets/"+petID+"/timeline", ownerTok, map[string]any{
		"type": "note", "occurred_at": "2026-08-18T09:00:00Z",
		"payload": map[string]any{"text": "今天精神不错"},
	})
	noteID := n.Body["event"].(map[string]any)["id"].(string)
	if r := e.Do("DELETE", "/api/v1/timeline-events/"+noteID, ownerTok, nil); r.Status != http.StatusNoContent {
		t.Fatalf("delete own note: %d %v", r.Status, r.Body)
	}
	_ = cgTok
}

func TestTimelineRequiresFamilyForSharedPet(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, familyA, petID := e.SetupFamily("tl-shared-a", "Milo")
	secondTok, _, familyB, _ := e.SetupFamily("tl-shared-b", "Coco")

	invite := e.Do("POST", "/api/v1/families/"+familyB+"/invite/refresh", secondTok, nil)
	if joined := e.Do("POST", "/api/v1/families/join", ownerTok, map[string]any{"code": invite.Body["invite_code"]}); joined.Status != http.StatusOK {
		t.Fatalf("join second family: %d %v", joined.Status, joined.Body)
	}
	if shared := e.Do("POST", "/api/v1/pets/"+petID+"/families", ownerTok, map[string]any{"family_id": familyB}); shared.Status < 200 || shared.Status > 299 {
		t.Fatalf("share pet: %d %v", shared.Status, shared.Body)
	}

	withoutFamily := e.Do("POST", "/api/v1/pets/"+petID+"/timeline", ownerTok, map[string]any{
		"type": "note", "occurred_at": "2026-08-18T08:00:00Z", "payload": map[string]any{"text": "没有家庭上下文"},
	})
	if withoutFamily.Status != http.StatusBadRequest {
		t.Fatalf("shared-pet event without family must be rejected: %d %v", withoutFamily.Status, withoutFamily.Body)
	}

	withFamily := e.Do("POST", "/api/v1/pets/"+petID+"/timeline", ownerTok, map[string]any{
		"family_id": familyB, "type": "note", "occurred_at": "2026-08-18T08:00:00Z", "payload": map[string]any{"text": "明确记录在第二家庭"},
	})
	if withFamily.Status != http.StatusCreated || withFamily.Body["event"].(map[string]any)["family_id"] != familyB {
		t.Fatalf("selected family event: %d %v", withFamily.Status, withFamily.Body)
	}
	_ = familyA
}

func TestTimelineMutationStaysInEventFamily(t *testing.T) {
	e := NewEnv(t)
	ownerATok, _, familyA, petID := e.SetupFamily("tl-mutation-a", "Milo")
	ownerBTok, _, familyB, _ := e.SetupFamily("tl-mutation-b", "Coco")

	invite := e.Do("POST", "/api/v1/families/"+familyB+"/invite/refresh", ownerBTok, nil)
	if joined := e.Do("POST", "/api/v1/families/join", ownerATok, map[string]any{"code": invite.Body["invite_code"]}); joined.Status != http.StatusOK {
		t.Fatalf("join second family: %d %v", joined.Status, joined.Body)
	}
	if shared := e.Do("POST", "/api/v1/pets/"+petID+"/families", ownerATok, map[string]any{"family_id": familyB}); shared.Status < 200 || shared.Status > 299 {
		t.Fatalf("share pet with second family: %d %v", shared.Status, shared.Body)
	}

	created := e.Do("POST", "/api/v1/pets/"+petID+"/timeline", ownerATok, map[string]any{
		"family_id": familyA, "type": "note", "occurred_at": "2026-08-18T08:00:00Z",
		"payload": map[string]any{"text": "家庭 A 的记录"},
	})
	if created.Status != http.StatusCreated {
		t.Fatalf("create family A event: %d %v", created.Status, created.Body)
	}
	eventID := created.Body["event"].(map[string]any)["id"].(string)

	// B 的管理员仍能看到共享宠物的历史，但不能改动 A 的家庭记录。
	if listed := e.Do("GET", "/api/v1/pets/"+petID+"/timeline", ownerBTok, nil); listed.Status != http.StatusOK {
		t.Fatalf("family B should read shared history: %d %v", listed.Status, listed.Body)
	}
	if updated := e.Do("PATCH", "/api/v1/timeline-events/"+eventID, ownerBTok, map[string]any{
		"occurred_at": "2026-08-18T09:00:00Z", "payload": map[string]any{"text": "越权修改"},
	}); updated.Status != http.StatusForbidden {
		t.Fatalf("family B must not update family A event: %d %v", updated.Status, updated.Body)
	}
	if deleted := e.Do("DELETE", "/api/v1/timeline-events/"+eventID, ownerBTok, nil); deleted.Status != http.StatusForbidden {
		t.Fatalf("family B must not delete family A event: %d %v", deleted.Status, deleted.Body)
	}
}

// TestWeightEventEditSyncsPetWeight：weight 事件编辑后回写 pets.weight_g（账实一致）。
func TestWeightEventEditSyncsPetWeight(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, _, petID := e.SetupFamily("we", "Milo")

	// 创建 5kg weight 事件 → 宠物体重 5kg
	w := e.Do("POST", "/api/v1/pets/"+petID+"/timeline", ownerTok, map[string]any{
		"type": "weight", "occurred_at": "2026-08-18T08:00:00Z",
		"payload": map[string]any{"weight_g": 5000},
	})
	if w.Status != http.StatusCreated {
		t.Fatalf("weight event: %d %v", w.Status, w.Body)
	}
	ev := w.Body["event"].(map[string]any)
	evID := ev["id"].(string)
	occ := ev["occurred_at"].(string)
	p := e.Do("GET", "/api/v1/pets/"+petID, ownerTok, nil)
	if int(p.Body["pet"].(map[string]any)["weight_g"].(float64)) != 5000 {
		t.Fatalf("pet.weight_g not 5kg after create: %v", p.Body["pet"])
	}

	// 编辑为 6kg → 宠物体重变为 6kg
	ed := e.Do("PATCH", "/api/v1/timeline-events/"+evID, ownerTok, map[string]any{
		"occurred_at": occ, "payload": map[string]any{"weight_g": 6000},
	})
	if ed.Status != http.StatusOK {
		t.Fatalf("edit weight: %d %v", ed.Status, ed.Body)
	}
	p2 := e.Do("GET", "/api/v1/pets/"+petID, ownerTok, nil)
	if int(p2.Body["pet"].(map[string]any)["weight_g"].(float64)) != 6000 {
		t.Fatalf("pet.weight_g not 6kg after edit: %v", p2.Body["pet"])
	}
}

// familyIDOf 从 /api/v1/families 取第一个圈 id
func (e *Env) familyIDOf(token string) string {
	l := e.Do("GET", "/api/v1/families", token, nil)
	cs := l.Body["families"].([]any)
	return cs[0].(map[string]any)["id"].(string)
}
