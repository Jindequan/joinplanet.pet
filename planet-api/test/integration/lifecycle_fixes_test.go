// 第二轮审查修复的回归测试：状态机死胡同与周期闭环。
package integration

import (
	"context"
	"fmt"
	"net/http"
	"testing"
	"time"
)

// F1：同一宠物的第二次转移必须让目标家庭真正获得可见边，且源家庭失去
// live 可见性。共享关系与转移关系不能混为一谈。
func TestTransferChainMovesVisibility(t *testing.T) {
	e := NewEnv(t)
	tokA, _, famA, petID := e.SetupFamily("tc-a", "Milo")
	tokB, _, famB, _ := e.SetupFamily("tc-b", "Milo2")
	tokC, _, famC, _ := e.SetupFamily("tc-c", "Milo3")

	mk := func(fromTok, fromFam, toFam string) string {
		key := fmt.Sprintf("transfer-%s-%s", fromFam, toFam)
		r := e.doWithHeader("POST", "/api/v1/pets/"+petID+"/transfer", fromTok,
			map[string]any{"to_family_id": toFam}, key)
		if r.Status != http.StatusCreated {
			t.Fatalf("create transfer %s->%s: %d %v", fromFam, toFam, r.Status, r.Body)
		}
		id, _ := r.Body["transfer"].(map[string]any)["id"].(string)
		return id
	}

	// A → B
	t1 := mk(tokA, famA, famB)
	if r := e.Do("POST", "/api/v1/transfers/"+t1+"/accept", tokB, nil); r.Status != http.StatusOK {
		t.Fatalf("accept A->B: %d %v", r.Status, r.Body)
	}
	// B → C（第二次转移，历史上会静默丢边）
	t2 := mk(tokB, famB, famC)
	if r := e.Do("POST", "/api/v1/transfers/"+t2+"/accept", tokC, nil); r.Status != http.StatusOK {
		t.Fatalf("accept B->C: %d %v", r.Status, r.Body)
	}
	// C 的家庭宠物列表必须包含该宠物
	listC := e.Do("GET", "/api/v1/families/"+famC+"/pets", tokC, nil)
	if listC.Status != http.StatusOK {
		t.Fatalf("list C pets: %d %v", listC.Status, listC.Body)
	}
	found := false
	for _, p := range listC.Body["pets"].([]any) {
		if p.(map[string]any)["id"] == petID {
			found = true
		}
	}
	if !found {
		t.Fatalf("second transfer must give family C visibility: %v", listC.Body)
	}
	// 原家庭 B 不应因转移自动保留可见性；需要继续看只能另行共享。
	listB := e.Do("GET", "/api/v1/families/"+famB+"/pets", tokB, nil)
	stillVisible := false
	for _, p := range listB.Body["pets"].([]any) {
		if p.(map[string]any)["id"] == petID {
			stillVisible = true
		}
	}
	if listB.Status != http.StatusOK || stillVisible {
		t.Fatalf("source family B must lose visibility after transfer: %d %v", listB.Status, listB.Body)
	}
	_ = famA
}

// F2：注销邮箱必须能重新注册。回归：状态查询不过滤 deleted_at，
// 注销用户重新请求验证码会收到假 sent=true 且永远收不到码。
func TestDeletedEmailCanReregister(t *testing.T) {
	e := NewEnv(t)
	tok, _, email := e.NewUser("rg")
	if r := e.Do("DELETE", "/api/v1/account", tok, map[string]any{"confirm": email}); r.Status != http.StatusNoContent {
		t.Fatalf("delete account: %d %v", r.Status, r.Body)
	}
	// 同一邮箱重新走登录：必须真的发出验证码（dev_code 非空）
	rc := e.Do("POST", "/api/v1/auth/request-code", "", map[string]any{"email": email})
	if rc.Status != http.StatusAccepted {
		t.Fatalf("re-register request-code: %d %v", rc.Status, rc.Body)
	}
	code, _ := rc.Body["dev_code"].(string)
	if code == "" {
		t.Fatal("deleted email must be issued a fresh code (was silently swallowed)")
	}
	vc := e.Do("POST", "/api/v1/auth/verify-code", "", map[string]any{"email": email, "code": code})
	if vc.Status != http.StatusOK {
		t.Fatalf("re-register verify: %d %v", vc.Status, vc.Body)
	}
}

// F17：注销账号不泄露直接身份，也不抹掉其他成员仍需要看到的照护历史。
// 回归：只把 users 标成 deleted 会留下邮箱、会话、验证码和幂等响应；
// 直接硬删 users 又会被共享责任链的 RESTRICT 外键拦住。
func TestAccountDeletionAnonymizesSharedHistoryAndCredentials(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, familyID, petID := e.SetupFamily("privacy-owner", "Milo")
	memberTok, memberID, memberEmail := e.NewUser("privacy-member")

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
	taskID, _ := created.Body["task"].(map[string]any)["id"].(string)
	requested := e.doWithHeader("POST", "/api/v1/care-occurrences/"+taskID+"/requests", ownerTok, map[string]any{
		"family_id": familyID, "target_user_id": memberID, "message": "今晚能帮忙遛狗吗？",
	}, "privacy-request-1")
	if requested.Status != http.StatusCreated {
		t.Fatalf("create care request: %d %v", requested.Status, requested.Body)
	}
	requestID, _ := requested.Body["care_request"].(map[string]any)["id"].(string)
	// Seed the account-scoped tables so this regression covers cleanup even
	// when the test user's normal free plan has no entitlement rows yet.
	if _, err := e.Pool.Exec(context.Background(), `INSERT INTO entitlements (user_id, key, source) VALUES ($1, 'privacy-test', 'test')`, memberID); err != nil {
		t.Fatalf("seed entitlement: %v", err)
	}
	if _, err := e.Pool.Exec(context.Background(), `INSERT INTO user_usage (user_id, resource, period, used) VALUES ($1, 'ai_monthly', 'privacy-test', 1)`, memberID); err != nil {
		t.Fatalf("seed user usage: %v", err)
	}
	if _, err := e.Pool.Exec(context.Background(), `INSERT INTO share_links (pet_id, kind, token_hash, options, snapshot, created_by_user_id, expires_at) VALUES ($1, 'care_card', 'privacy-test-token-hash', '{}', '{}', $2, now() + interval '1 day')`, petID, memberID); err != nil {
		t.Fatalf("seed share link: %v", err)
	}

	if deleted := e.Do("DELETE", "/api/v1/account", memberTok, map[string]any{"confirm": memberEmail}); deleted.Status != http.StatusNoContent {
		t.Fatalf("delete member account: %d %v", deleted.Status, deleted.Body)
	}

	var status, displayName, email string
	if err := e.Pool.QueryRow(context.Background(),
		`SELECT status, display_name, email FROM users WHERE id=$1`, memberID).Scan(&status, &displayName, &email); err != nil {
		t.Fatalf("read deleted user: %v", err)
	}
	if status != "deleted" || displayName != "已删除账号" || email == memberEmail || email == "" {
		t.Fatalf("deleted user must be anonymized: status=%q display_name=%q email=%q", status, displayName, email)
	}

	var authChallenges, sessions, idempotencyKeys, emailRateLimits, entitlements, userUsage, shareLinks int
	if err := e.Pool.QueryRow(context.Background(), `SELECT count(*) FROM auth_challenges WHERE email=$1`, memberEmail).Scan(&authChallenges); err != nil {
		t.Fatalf("count auth challenges: %v", err)
	}
	if err := e.Pool.QueryRow(context.Background(), `SELECT count(*) FROM sessions WHERE user_id=$1`, memberID).Scan(&sessions); err != nil {
		t.Fatalf("count sessions: %v", err)
	}
	if err := e.Pool.QueryRow(context.Background(), `SELECT count(*) FROM idempotency_keys WHERE principal_user_id=$1`, memberID).Scan(&idempotencyKeys); err != nil {
		t.Fatalf("count idempotency keys: %v", err)
	}
	if err := e.Pool.QueryRow(context.Background(), `SELECT count(*) FROM auth_rate_limits WHERE rate_key=$1`, memberEmail).Scan(&emailRateLimits); err != nil {
		t.Fatalf("count email rate limits: %v", err)
	}
	if err := e.Pool.QueryRow(context.Background(), `SELECT count(*) FROM entitlements WHERE user_id=$1`, memberID).Scan(&entitlements); err != nil {
		t.Fatalf("count entitlements: %v", err)
	}
	if err := e.Pool.QueryRow(context.Background(), `SELECT count(*) FROM user_usage WHERE user_id=$1`, memberID).Scan(&userUsage); err != nil {
		t.Fatalf("count user usage: %v", err)
	}
	if err := e.Pool.QueryRow(context.Background(), `SELECT count(*) FROM share_links WHERE created_by_user_id=$1`, memberID).Scan(&shareLinks); err != nil {
		t.Fatalf("count share links: %v", err)
	}
	if authChallenges != 0 || sessions != 0 || idempotencyKeys != 0 || emailRateLimits != 0 || entitlements != 0 || userUsage != 0 || shareLinks != 0 {
		t.Fatalf("account credentials must be removed: auth_challenges=%d sessions=%d idempotency_keys=%d email_rate_limits=%d entitlements=%d user_usage=%d share_links=%d", authChallenges, sessions, idempotencyKeys, emailRateLimits, entitlements, userUsage, shareLinks)
	}

	// 共享照护历史必须仍能被原家庭成员读取，但不能再回显被删账号的邮箱。
	view := e.Do("GET", "/api/v1/care-requests/"+requestID, ownerTok, nil)
	if view.Status != http.StatusOK {
		t.Fatalf("shared request must remain readable: %d %v", view.Status, view.Body)
	}
	history := view.Body["care_request"].(map[string]any)
	if history["target_user_name"] != "已删除账号" || history["target_user_name"] == memberEmail {
		t.Fatalf("shared history must use deleted-account label: %v", history)
	}
}

// F4：未来日期的 digest 视图/发送必须 400。回归：TodayWithoutAuth 无守卫，
// ?date=<未来> 会把今天尚未到点的 pending 批量打成 missed。
func TestDigestFutureDateRejected(t *testing.T) {
	e := NewEnv(t)
	tok, _, familyID, _ := e.SetupFamily("fd", "Milo")
	future := time.Now().AddDate(0, 0, 3).Format("2006-01-02")
	if r := e.Do("GET", "/api/v1/families/"+familyID+"/digest?date="+future, tok, nil); r.Status != http.StatusBadRequest {
		t.Fatalf("future digest date must be 400: %d %v", r.Status, r.Body)
	}
	if r := e.Do("POST", "/api/v1/families/"+familyID+"/digest/send", tok, map[string]any{"date": future}); r.Status != http.StatusBadRequest {
		t.Fatalf("future digest send must be 400: %d %v", r.Status, r.Body)
	}
}

// F5：归档冻结照护状态——pending 定格 cancelled、值班结束、值班者仍可释放。
func TestArchiveFreezesCareState(t *testing.T) {
	e := NewEnv(t)
	tok, _, familyID, petID := e.SetupFamily("ar", "Milo")
	r := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", tok,
		`{"title":"喂食","schedule":{"v":1,"kind":"daily"},"time_of_day":"09:00"}`)
	if r.Status != http.StatusCreated {
		t.Fatalf("mk task: %d %v", r.Status, r.Body)
	}
	// 物化今天的 occurrence
	today := e.Do("GET", "/api/v1/families/"+familyID+"/today", tok, nil)
	if today.Status != http.StatusOK {
		t.Fatalf("today: %d %v", today.Status, today.Body)
	}
	// 值班（需要 Idempotency-Key）
	if r := e.doWithHeader("POST", "/api/v1/pets/"+petID+"/handoff", tok, map[string]any{}, "handoff-ar-1"); r.Status != http.StatusCreated && r.Status != http.StatusOK {
		t.Fatalf("claim handoff: %d %v", r.Status, r.Body)
	}
	// 归档
	if r := e.Do("POST", "/api/v1/pets/"+petID+"/archive", tok, nil); r.Status != http.StatusOK {
		t.Fatalf("archive: %d %v", r.Status, r.Body)
	}
	// 归档宠的 pending 不应烂成 missed：统计里 cancelled 不进分母
	from := time.Now().AddDate(0, 0, -1).Format("2006-01-02")
	to := time.Now().Format("2006-01-02")
	stats := e.Do("GET", "/api/v1/care-stats?from="+from+"&to="+to+"&pet_id="+petID, tok, nil)
	if stats.Status != http.StatusOK || stats.Body["total"] != float64(0) {
		t.Fatalf("archived pet pending must be cancelled, not missed: %d %v", stats.Status, stats.Body)
	}
	// 归档即结束值班：GET 应返回空（曾经：值班永远卡在已归档宠上，
	// 释放还会撞 PET_ARCHIVED 409）。
	if r := e.Do("GET", "/api/v1/pets/"+petID+"/handoff", tok, nil); r.Status != http.StatusOK || r.Body["handoff"] != nil {
		t.Fatalf("archive must end the active handoff: %d %v", r.Status, r.Body)
	}
}

// F6：停药联动归档挂载的照护计划。
func TestMedStopArchivesLinkedPlan(t *testing.T) {
	e := NewEnv(t)
	tok, _, familyID, petID := e.SetupFamily("ms", "Milo")
	med := e.DoJSON("POST", "/api/v1/pets/"+petID+"/medications", tok, `{"name":"抗生素"}`)
	if med.Status != http.StatusCreated {
		t.Fatalf("mk med: %d %v", med.Status, med.Body)
	}
	medID, _ := med.Body["medication"].(map[string]any)["id"].(string)
	r := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", tok,
		`{"title":"喂抗生素","medication_id":"`+medID+`","schedule":{"v":1,"kind":"daily"},"time_of_day":"08:00"}`)
	if r.Status != http.StatusCreated {
		t.Fatalf("mk linked task: %d %v", r.Status, r.Body)
	}
	// 停药前 Today 可见
	if today := e.Do("GET", "/api/v1/families/"+familyID+"/today", tok, nil); today.Status != http.StatusOK {
		t.Fatalf("today: %d %v", today.Status, today.Body)
	}
	if r := e.Do("POST", "/api/v1/medications/"+medID+"/stop", tok, nil); r.Status != http.StatusOK {
		t.Fatalf("stop med: %d %v", r.Status, r.Body)
	}
	// 停药后不再生成/显示
	today := e.Do("GET", "/api/v1/families/"+familyID+"/today", tok, nil)
	if today.Status != http.StatusOK {
		t.Fatalf("today after stop: %d %v", today.Status, today.Body)
	}
	for _, pg := range today.Body["pets"].([]any) {
		if items := pg.(map[string]any)["items"].([]any); len(items) != 0 {
			t.Fatalf("stopped med plan must not generate occurrences: %v", items)
		}
	}
}

// F8：家庭删除前必须清空宠物链接。
func TestFamilyDeleteRequiresEmpty(t *testing.T) {
	e := NewEnv(t)
	tok, _, familyID, petID := e.SetupFamily("fe", "Milo")
	if r := e.Do("DELETE", "/api/v1/families/"+familyID, tok, map[string]any{"confirm": "fe圈"}); r.Status != http.StatusConflict || e.ErrorCode(r) != "FAMILY_NOT_EMPTY" {
		t.Fatalf("delete non-empty family must be 409 FAMILY_NOT_EMPTY: %d %v", r.Status, r.Body)
	}
	// 解除链接后可删
	if r := e.Do("DELETE", "/api/v1/pets/"+petID+"/families/"+familyID, tok, nil); r.Status != http.StatusNoContent {
		t.Fatalf("unlink: %d %v", r.Status, r.Body)
	}
	if r := e.Do("DELETE", "/api/v1/families/"+familyID, tok, map[string]any{"confirm": "fe圈"}); r.Status != http.StatusNoContent {
		t.Fatalf("delete emptied family: %d %v", r.Status, r.Body)
	}
}

// F16：当天提前完成合法（先记录后补全）。
func TestEarlySameDayCompletion(t *testing.T) {
	e := NewEnv(t)
	tok, _, familyID, petID := e.SetupFamily("ec", "Milo")
	r := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", tok,
		`{"title":"晚间药","schedule":{"v":1,"kind":"daily"},"time_of_day":"23:30"}`)
	if r.Status != http.StatusCreated {
		t.Fatalf("mk task: %d %v", r.Status, r.Body)
	}
	today := e.Do("GET", "/api/v1/families/"+familyID+"/today", tok, nil)
	var taskID string
	for _, pg := range today.Body["pets"].([]any) {
		for _, item := range pg.(map[string]any)["items"].([]any) {
			m := item.(map[string]any)
			if m["task"] != nil {
				taskID, _ = m["task"].(map[string]any)["id"].(string)
			}
		}
	}
	if taskID == "" {
		t.Fatal("today must list the evening task")
	}
	if r := e.Do("POST", "/api/v1/tasks/"+taskID+"/logs", tok, map[string]any{"status": "done"}); r.Status != http.StatusCreated {
		t.Fatalf("early same-day completion must be allowed: %d %v", r.Status, r.Body)
	}
}

// round-1 遗留：skip 不得追溯改写 7 天窗口之外的统计事实。
func TestScheduleActionRetroactiveBound(t *testing.T) {
	e := NewEnv(t)
	tok, _, familyID, petID := e.SetupFamily("rb", "Milo")
	r := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", tok,
		`{"title":"喂食","schedule":{"v":1,"kind":"daily"},"time_of_day":"09:00"}`)
	if r.Status != http.StatusCreated {
		t.Fatalf("mk task: %d %v", r.Status, r.Body)
	}
	taskID, _ := r.Body["task"].(map[string]any)["id"].(string)
	// 拿到规则 id（通过任务详情或今日条目）——slot 需要 care_rule_id。
	today := e.Do("GET", "/api/v1/families/"+familyID+"/today", tok, nil)
	var ruleID string
	for _, pg := range today.Body["pets"].([]any) {
		for _, item := range pg.(map[string]any)["items"].([]any) {
			m := item.(map[string]any)
			if task, ok := m["task"].(map[string]any); ok {
				ruleID, _ = task["care_rule_id"].(string)
			}
		}
	}
	if ruleID == "" {
		t.Fatal("care_rule_id missing from today item")
	}
	old := time.Now().AddDate(0, 0, -10).Format("2006-01-02")
	key := "skip-retro-" + old
	sr := e.doWithHeader("POST", "/api/v1/care-schedule/actions", tok, map[string]any{
		"action": "skip", "scope": "this",
		"slot": map[string]any{"care_rule_id": ruleID, "care_plan_id": taskID, "date": old},
	}, key)
	if sr.Status != http.StatusBadRequest {
		t.Fatalf("retroactive skip beyond 7 days must be 400: %d %v", sr.Status, sr.Body)
	}
	_ = taskID
}

// F3：目标圈主人注销账号必须取消涉及该圈的 pending 转移。
// 回归：注销路径曾用裸 UPDATE 删家庭、跳过全部清理——转移变僵尸
// （accept/decline/cancel 全 404），uq_pet_transfers_pending 永久锁死新转移。
func TestAccountDeletionCancelsPendingTransfer(t *testing.T) {
	e := NewEnv(t)
	tokY, _, famA, petID := e.SetupFamily("ac-y", "Milo")
	tokZ, _, emailZ := e.NewUser("ac-z")
	fz := e.Do("POST", "/api/v1/families", tokZ, map[string]any{"name": "ac-z圈", "timezone": "Asia/Shanghai"})
	famB, _ := fz.Body["family"].(map[string]any)["id"].(string)
	_, _, famC, _ := e.SetupFamily("ac-w", "Milo3")

	// Y（宠物主人 + 源圈 owner）发起 A→B 转移
	r := e.doWithHeader("POST", "/api/v1/pets/"+petID+"/transfer", tokY,
		map[string]any{"to_family_id": famB}, "ac-transfer-1")
	if r.Status != http.StatusCreated {
		t.Fatalf("create transfer: %d %v", r.Status, r.Body)
	}

	// B 圈主人注销 → 涉及 B 的 pending 转移必须被取消
	if r := e.Do("DELETE", "/api/v1/account", tokZ, map[string]any{"confirm": emailZ}); r.Status != http.StatusNoContent {
		t.Fatalf("delete account: %d %v", r.Status, r.Body)
	}

	// 僵尸转移不得再锁死新转移：A→C 应可创建（曾经 409 TRANSFER_PENDING_EXISTS）
	r2 := e.doWithHeader("POST", "/api/v1/pets/"+petID+"/transfer", tokY,
		map[string]any{"to_family_id": famC}, "ac-transfer-2")
	if r2.Status != http.StatusCreated {
		t.Fatalf("new transfer after account deletion must be possible: %d %v", r2.Status, r2.Body)
	}
	// 出站列表里旧转移应是 cancelled
	list := e.Do("GET", "/api/v1/families/"+famA+"/transfers?direction=outgoing", tokY, nil)
	if list.Status != http.StatusOK {
		t.Fatalf("list transfers: %d %v", list.Status, list.Body)
	}
	for _, tr := range list.Body["transfers"].([]any) {
		m := tr.(map[string]any)
		if m["to_family_id"] == famB && m["status"] == "pending" {
			t.Fatalf("transfer to deleted family must be cancelled: %v", m)
		}
	}
}

// M1（技术复审）：目标圈已通过共享持有 live 边时，转移接受必须把它升级为
// primary，而不是被 (family_id, pet_id) 唯一索引静默吞掉导致全库失去 primary。
func TestTransferPromotesExistingSharedEdgeToPrimary(t *testing.T) {
	e := NewEnv(t)
	tokA, _, _, petID := e.SetupFamily("sp-a", "Milo")
	tokB, _, famB, _ := e.SetupFamily("sp-b", "Milo2")
	// B 的主人加入 A 圈以建立成员关系后……不需要：共享只要求 owner 是目标圈成员。
	// 直接把宠物共享给 B（owner 同时是 B 的 owner——SetupFamily 两个圈同一创建者不成立，
	// 这里用独立用户 B 并让其加入 A 圈获得可见性即可；share 只需 owner 是 B 成员）。
	// 简化：A 的 owner 同时被邀请进 B（成为 B 成员）。
	ri := e.Do("POST", "/api/v1/families/"+famB+"/invite/refresh", tokB, nil)
	invite, _ := ri.Body["invite_code"].(string)
	if r := e.Do("POST", "/api/v1/families/join", tokA, map[string]any{"code": invite}); r.Status != http.StatusOK {
		t.Fatalf("A owner joins B: %d %v", r.Status, r.Body)
	}
	if r := e.Do("POST", "/api/v1/pets/"+petID+"/families", tokA, map[string]any{"family_id": famB}); r.Status != http.StatusNoContent && r.Status != http.StatusOK && r.Status != http.StatusCreated {
		t.Fatalf("share pet to B: %d %v", r.Status, r.Body)
	}
	// 转移 A→B 并接受
	tr := e.doWithHeader("POST", "/api/v1/pets/"+petID+"/transfer", tokA, map[string]any{"to_family_id": famB}, "sp-transfer-1")
	if tr.Status != http.StatusCreated {
		t.Fatalf("create transfer: %d %v", tr.Status, tr.Body)
	}
	trID, _ := tr.Body["transfer"].(map[string]any)["id"].(string)
	if r := e.Do("POST", "/api/v1/transfers/"+trID+"/accept", tokB, nil); r.Status != http.StatusOK {
		t.Fatalf("accept: %d %v", r.Status, r.Body)
	}
	var rel string
	if err := e.Pool.QueryRow(context.Background(),
		`SELECT relationship_type FROM family_pet_links WHERE pet_id=$1 AND family_id=$2 AND unlinked_at IS NULL AND deleted_at IS NULL`,
		petID, famB).Scan(&rel); err != nil {
		t.Fatalf("read link: %v", err)
	}
	if rel != "primary" {
		t.Fatalf("B's pre-existing shared edge must be promoted to primary, got %q", rel)
	}
}

// M3（技术复审）：非主管圈改时区不得平移共享宠物的规则时区；主管圈可以。
func TestFamilyTimezonePropagationScopedToManagingFamily(t *testing.T) {
	e := NewEnv(t)
	tokA, _, famA, petID := e.SetupFamily("tz-a", "Milo")
	tokB, _, famB, _ := e.SetupFamily("tz-b", "Milo2")
	ri := e.Do("POST", "/api/v1/families/"+famB+"/invite/refresh", tokB, nil)
	invite, _ := ri.Body["invite_code"].(string)
	e.Do("POST", "/api/v1/families/join", tokA, map[string]any{"code": invite})
	if r := e.Do("POST", "/api/v1/pets/"+petID+"/families", tokA, map[string]any{"family_id": famB}); r.Status < 200 || r.Status > 299 {
		t.Fatalf("share: %d %v", r.Status, r.Body)
	}
	r := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", tokA,
		`{"family_id":"`+famA+`","title":"喂食","schedule":{"v":1,"kind":"daily"},"time_of_day":"09:00"}`)
	if r.Status != http.StatusCreated {
		t.Fatalf("mk task: %d %v", r.Status, r.Body)
	}
	ruleID, _ := r.Body["task"].(map[string]any)["care_rule_id"].(string)

	// 非主管圈 B 改时区：规则不动（共享多圈 = 冻结）
	if r := e.Do("PATCH", "/api/v1/families/"+famB, tokB, map[string]any{"timezone": "Asia/Tokyo"}); r.Status != http.StatusOK {
		t.Fatalf("B change tz: %d %v", r.Status, r.Body)
	}
	var tz string
	e.Pool.QueryRow(context.Background(), `SELECT timezone FROM care_rules WHERE id=$1`, ruleID).Scan(&tz)
	if tz != "Asia/Shanghai" {
		t.Fatalf("non-managing family must not move rule tz: %q", tz)
	}

	// 单链接场景（去掉 B 链接后 A 成为唯一圈）：A 改时区必须传播
	if r := e.Do("DELETE", "/api/v1/pets/"+petID+"/families/"+famB, tokA, nil); r.Status != http.StatusNoContent {
		t.Fatalf("unlink B: %d %v", r.Status, r.Body)
	}
	if r := e.Do("PATCH", "/api/v1/families/"+famA, tokA, map[string]any{"timezone": "Asia/Tokyo"}); r.Status != http.StatusOK {
		t.Fatalf("A change tz: %d %v", r.Status, r.Body)
	}
	e.Pool.QueryRow(context.Background(), `SELECT timezone FROM care_rules WHERE id=$1`, ruleID).Scan(&tz)
	if tz != "Asia/Tokyo" {
		t.Fatalf("managing (single-link) family tz must propagate: %q", tz)
	}
}

// M4（技术复审）：归档→当天反归档后，当天的照护项必须恢复（不再静默消失一天）。
func TestUnarchiveRestoresSameDayCare(t *testing.T) {
	e := NewEnv(t)
	tok, _, familyID, petID := e.SetupFamily("ua", "Milo")
	r := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", tok,
		`{"title":"喂食","schedule":{"v":1,"kind":"daily"},"time_of_day":"23:00"}`)
	if r.Status != http.StatusCreated {
		t.Fatalf("mk task: %d %v", r.Status, r.Body)
	}
	if today := e.Do("GET", "/api/v1/families/"+familyID+"/today", tok, nil); today.Status != http.StatusOK {
		t.Fatalf("today: %d %v", today.Status, today.Body)
	}
	if r := e.Do("POST", "/api/v1/pets/"+petID+"/archive", tok, nil); r.Status != http.StatusOK {
		t.Fatalf("archive: %d %v", r.Status, r.Body)
	}
	if r := e.Do("POST", "/api/v1/pets/"+petID+"/unarchive", tok, nil); r.Status != http.StatusOK {
		t.Fatalf("unarchive: %d %v", r.Status, r.Body)
	}
	today := e.Do("GET", "/api/v1/families/"+familyID+"/today", tok, nil)
	count := 0
	for _, pg := range today.Body["pets"].([]any) {
		count += len(pg.(map[string]any)["items"].([]any))
	}
	if count != 1 {
		t.Fatalf("unarchive must restore same-day care items, got %d: %v", count, today.Body)
	}
}

// 暂停计划必须停止生成当天待办；恢复后当天待办立即重新出现。
func TestPauseResumeCarePlan(t *testing.T) {
	e := NewEnv(t)
	tok, _, familyID, petID := e.SetupFamily("pause", "Milo")
	r := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", tok,
		`{"title":"晚间遛弯","schedule":{"v":1,"kind":"daily"},"time_of_day":"23:00"}`)
	if r.Status != http.StatusCreated {
		t.Fatalf("create: %d %v", r.Status, r.Body)
	}
	id, _ := r.Body["task"].(map[string]any)["care_plan_id"].(string)
	if id == "" {
		t.Fatalf("no care_plan_id in %v", r.Body)
	}
	plans := e.Do("GET", "/api/v1/pets/"+petID+"/care-plans", tok, nil)
	if plans.Status != http.StatusOK {
		t.Fatalf("care plans: %d %v", plans.Status, plans.Body)
	}
	foundNext := false
	for _, raw := range plans.Body["care_plans"].([]any) {
		if plan, ok := raw.(map[string]any); ok && plan["id"] == id {
			if dueDate, ok := plan["due_date"].(string); !ok || dueDate == "" {
				t.Fatalf("care-plan list must expose the next occurrence date: %v", plan)
			}
			foundNext = true
		}
	}
	if !foundNext {
		t.Fatalf("created care plan missing from list: %v", plans.Body)
	}

	todayHasPlan := func() bool {
		today := e.Do("GET", "/api/v1/families/"+familyID+"/today", tok, nil)
		if today.Status != http.StatusOK {
			t.Fatalf("today: %d %v", today.Status, today.Body)
		}
		for _, pet := range today.Body["pets"].([]any) {
			for _, item := range pet.(map[string]any)["items"].([]any) {
				if item.(map[string]any)["task"].(map[string]any)["care_plan_id"] == id {
					return true
				}
			}
		}
		return false
	}
	if !todayHasPlan() {
		t.Fatal("new active plan should appear in Today")
	}

	if r := e.DoJSON("PATCH", "/api/v1/care-plans/"+id, tok, `{"status":"paused"}`); r.Status != http.StatusOK {
		t.Fatalf("pause: %d %v", r.Status, r.Body)
	}
	if todayHasPlan() {
		t.Fatal("paused plan must not appear in Today")
	}

	if r := e.DoJSON("PATCH", "/api/v1/care-plans/"+id, tok, `{"status":"active"}`); r.Status != http.StatusOK {
		t.Fatalf("resume: %d %v", r.Status, r.Body)
	}
	if !todayHasPlan() {
		t.Fatal("resumed plan should reappear in Today")
	}
}

// PATCH time_of_day 三态：null=清空、缺省=不动（RawMessage 区分，曾因 *string 折叠而清空静默失效）。
func TestPatchTimeOfDayTriState(t *testing.T) {
	e := NewEnv(t)
	tok, _, _, petID := e.SetupFamily("tod", "Milo")
	r := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", tok,
		`{"title":"喂药","schedule":{"v":1,"kind":"daily"},"time_of_day":"08:30"}`)
	if r.Status != http.StatusCreated {
		t.Fatalf("create: %d %v", r.Status, r.Body)
	}
	// 前端主用别名路由：返回首次实例，计划 id 在 care_plan_id。
	id, _ := r.Body["task"].(map[string]any)["care_plan_id"].(string)
	if id == "" {
		t.Fatalf("no care_plan_id in %v", r.Body)
	}

	// null 清空
	r = e.DoJSON("PATCH", "/api/v1/care-plans/"+id, tok, `{"time_of_day":null}`)
	if r.Status != http.StatusOK {
		t.Fatalf("patch null: %d %v", r.Status, r.Body)
	}
	got := e.Do("GET", "/api/v1/pets/"+petID+"/care-plans", tok, nil)
	var tod any = "sentinel"
	for _, p := range got.Body["care_plans"].([]any) {
		if m := p.(map[string]any); m["id"] == id {
			tod = m["time_of_day"]
		}
	}
	if tod != nil {
		t.Fatalf("after null-clear time_of_day = %v, want nil", tod)
	}

	// 缺省不动：只改标题，清空后的时间保持为空
	r = e.DoJSON("PATCH", "/api/v1/care-plans/"+id, tok, `{"title":"喂药改"}`)
	if r.Status != http.StatusOK {
		t.Fatalf("patch title: %d %v", r.Status, r.Body)
	}
	got = e.Do("GET", "/api/v1/pets/"+petID+"/care-plans", tok, nil)
	for _, p := range got.Body["care_plans"].([]any) {
		if m := p.(map[string]any); m["id"] == id {
			if m["time_of_day"] != nil {
				t.Fatalf("absent field should keep nil, got %v", m["time_of_day"])
			}
			if m["title"] != "喂药改" {
				t.Fatalf("title not updated: %v", m["title"])
			}
		}
	}

	// 重新设置为 20:00，再验证
	r = e.DoJSON("PATCH", "/api/v1/care-plans/"+id, tok, `{"time_of_day":"20:00"}`)
	if r.Status != http.StatusOK {
		t.Fatalf("patch set: %d %v", r.Status, r.Body)
	}
	got = e.Do("GET", "/api/v1/pets/"+petID+"/care-plans", tok, nil)
	for _, p := range got.Body["care_plans"].([]any) {
		if m := p.(map[string]any); m["id"] == id {
			if m["time_of_day"] == nil {
				t.Fatal("time_of_day should be set again")
			}
		}
	}
}

// Explicitly clearing a care-plan title must fail instead of silently keeping
// the old value. A blank title makes the editor's result differ from the
// user's input and is especially confusing on retry.
func TestPatchCarePlanRejectsBlankTitle(t *testing.T) {
	e := NewEnv(t)
	tok, _, _, petID := e.SetupFamily("blank-title", "Milo")
	created := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", tok,
		`{"title":"晚间遛弯","schedule":{"v":1,"kind":"daily"}}`)
	if created.Status != http.StatusCreated {
		t.Fatalf("create: %d %v", created.Status, created.Body)
	}
	id, _ := created.Body["task"].(map[string]any)["care_plan_id"].(string)
	if id == "" {
		t.Fatalf("no care_plan_id in %v", created.Body)
	}

	if rejected := e.DoJSON("PATCH", "/api/v1/care-plans/"+id, tok, `{"title":"   "}`); rejected.Status != http.StatusBadRequest {
		t.Fatalf("blank title should be rejected: %d %v", rejected.Status, rejected.Body)
	}
	plans := e.Do("GET", "/api/v1/pets/"+petID+"/care-plans", tok, nil)
	if plans.Status != http.StatusOK {
		t.Fatalf("list plans: %d %v", plans.Status, plans.Body)
	}
	found := false
	for _, raw := range plans.Body["care_plans"].([]any) {
		plan := raw.(map[string]any)
		if plan["id"] == id {
			found = true
			if plan["title"] != "晚间遛弯" {
				t.Fatalf("failed title update must preserve original title: %v", plan["title"])
			}
		}
	}
	if !found {
		t.Fatalf("created care plan %s was missing from list", id)
	}
}
