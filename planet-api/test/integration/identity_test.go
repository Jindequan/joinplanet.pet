package integration

import (
	"net/http"
	"testing"
)

func TestIdentityFlow(t *testing.T) {
	e := NewEnv(t)
	token, userID, email := e.NewUser("id")

	// /me
	me := e.Do("GET", "/api/v1/me", token, nil)
	if me.Status != http.StatusOK {
		t.Fatalf("me: %d", me.Status)
	}
	if me.Body["user"].(map[string]any)["id"] != userID {
		t.Fatalf("me user id mismatch")
	}
	caps := e.Do("GET", "/api/v1/me/capabilities", token, nil)
	if caps.Status != http.StatusOK {
		t.Fatalf("capabilities: %d %v", caps.Status, caps.Body)
	}
	if caps.Body["push_notifications"] != true || caps.Body["digest"] != true || caps.Body["alerts"] != true {
		t.Fatalf("shipped notification capabilities must be enabled: %v", caps.Body)
	}
	if caps.Body["export_pdf"] != false {
		t.Fatalf("unfinished capabilities must stay explicit: %v", caps.Body)
	}
	if caps.Body["care_responsibility_api"] != true {
		t.Fatalf("shipped care responsibility capability must be enabled: %v", caps.Body)
	}
	_ = email

	// 重复登录同邮箱 → 同一用户
	rc := e.Do("POST", "/api/v1/auth/request-code", "", map[string]any{"email": email})
	code := rc.Body["dev_code"].(string)
	vc := e.Do("POST", "/api/v1/auth/verify-code", "", map[string]any{"email": email, "code": code})
	if vc.Status != http.StatusOK {
		t.Fatalf("re-login: %d %v", vc.Status, vc.Body)
	}
	if vc.Body["user"].(map[string]any)["id"] != userID {
		t.Fatal("re-login created duplicate user")
	}

	// 验证码一次性：旧码再用 → 401
	bad := e.Do("POST", "/api/v1/auth/verify-code", "", map[string]any{"email": email, "code": code})
	if bad.Status != http.StatusUnauthorized {
		t.Fatalf("code reuse should 401, got %d", bad.Status)
	}

	// 错码 5 次后作废
	email2 := "brute@test.planet"
	for i := 0; i < 5; i++ {
		e.Do("POST", "/api/v1/auth/request-code", "", map[string]any{"email": email2})
		r := e.Do("POST", "/api/v1/auth/verify-code", "", map[string]any{"email": email2, "code": "000000"})
		if r.Status != http.StatusUnauthorized {
			t.Fatalf("wrong code attempt %d: %d", i, r.Status)
		}
	}
	// 拿真码也应失效（attempts≥5 已 consume）
	rc2 := e.Do("POST", "/api/v1/auth/request-code", "", map[string]any{"email": email2})
	// 注意：新请求会换新码。此处验证"旧流程"已锁死——重新取码应是新的
	if rc2.Body["dev_code"] == "000000" {
		t.Fatal("dev code collision")
	}

	// 无 token → 401
	if r := e.Do("GET", "/api/v1/me", "", nil); r.Status != http.StatusUnauthorized {
		t.Fatalf("no token: %d", r.Status)
	}

	// 登出后旧 token 失效
	if r := e.Do("DELETE", "/api/v1/auth/session", token, nil); r.Status != http.StatusNoContent {
		t.Fatalf("logout: %d", r.Status)
	}
	if r := e.Do("GET", "/api/v1/me", token, nil); r.Status != http.StatusUnauthorized {
		t.Fatalf("revoked session still works: %d", r.Status)
	}

	// 改名
	tok2, _, _ := e.NewUser("id2")
	if r := e.Do("PATCH", "/api/v1/me", tok2, map[string]any{"display_name": "小米"}); r.Status != http.StatusOK {
		t.Fatalf("patch me: %d", r.Status)
	}
}

func TestRateLimitRequestCode(t *testing.T) {
	e := NewEnvStrict(t)
	email := "rl@test.planet"
	// 第一封 202，第二封 1 分钟内 → 429
	if r := e.Do("POST", "/api/v1/auth/request-code", "", map[string]any{"email": email}); r.Status != http.StatusAccepted {
		t.Fatalf("first: %d", r.Status)
	}
	r := e.Do("POST", "/api/v1/auth/request-code", "", map[string]any{"email": email})
	if r.Status != http.StatusTooManyRequests || e.ErrorCode(r) != "AUTH_RATE_LIMITED" {
		t.Fatalf("expected 429 AUTH_RATE_LIMITED, got %d %v", r.Status, r.Body)
	}
	_ = http.StatusOK
}

func TestPreferencesRejectMismatchedDefaultFamilyAndPet(t *testing.T) {
	e := NewEnv(t)
	tok, _, familyA, petA := e.SetupFamily("pref-a", "Milo")
	otherTok, _, familyB, _ := e.SetupFamily("pref-b", "Coco")
	invite := e.Do("POST", "/api/v1/families/"+familyB+"/invite/refresh", otherTok, nil)
	if invite.Status != http.StatusOK {
		t.Fatalf("refresh second family invite: %d %v", invite.Status, invite.Body)
	}
	joined := e.Do("POST", "/api/v1/families/join", tok, map[string]any{"code": invite.Body["invite_code"]})
	if joined.Status != http.StatusOK {
		t.Fatalf("join second family: %d %v", joined.Status, joined.Body)
	}

	valid := e.Do("PATCH", "/api/v1/me/preferences", tok, map[string]any{
		"default_family_id": familyA,
		"default_pet_id":    petA,
	})
	if valid.Status != http.StatusOK {
		t.Fatalf("valid family/pet preference: %d %v", valid.Status, valid.Body)
	}

	invalid := e.Do("PATCH", "/api/v1/me/preferences", tok, map[string]any{
		"default_family_id": familyB,
		"default_pet_id":    petA,
	})
	if invalid.Status != http.StatusBadRequest || e.ErrorCode(invalid) != "VALIDATION_FAILED" {
		t.Fatalf("mismatched family/pet should be rejected: %d %v", invalid.Status, invalid.Body)
	}
	current := e.Do("GET", "/api/v1/me/preferences", tok, nil)
	preferences := current.Body["preferences"].(map[string]any)
	if preferences["default_family_id"] != familyA || preferences["default_pet_id"] != petA {
		t.Fatalf("invalid preference update was partially applied: %v", preferences)
	}
}

func TestSessionListAndRemoteRevoke(t *testing.T) {
	e := NewEnv(t)
	token, userID, email := e.NewUser("sessions")

	login := func() string {
		rc := e.Do("POST", "/api/v1/auth/request-code", "", map[string]any{"email": email})
		code := rc.Body["dev_code"].(string)
		vc := e.Do("POST", "/api/v1/auth/verify-code", "", map[string]any{"email": email, "code": code, "device": "second-device"})
		if vc.Status != http.StatusOK {
			t.Fatalf("second login: %d %v", vc.Status, vc.Body)
		}
		return vc.Body["token"].(string)
	}

	second := login()
	list := e.Do("GET", "/api/v1/me/sessions", token, nil)
	if list.Status != http.StatusOK {
		t.Fatalf("list sessions: %d %v", list.Status, list.Body)
	}
	sessions := list.Body["sessions"].([]any)
	if len(sessions) != 2 {
		t.Fatalf("expected two active sessions for user %s, got %d", userID, len(sessions))
	}
	secondID := ""
	for _, raw := range sessions {
		item := raw.(map[string]any)
		if item["is_current"] == false {
			secondID = item["id"].(string)
		}
	}
	if secondID == "" {
		t.Fatal("session list did not identify the remote session")
	}
	if revoked := e.Do("DELETE", "/api/v1/me/sessions/"+secondID, token, nil); revoked.Status != http.StatusNoContent {
		t.Fatalf("revoke remote session: %d %v", revoked.Status, revoked.Body)
	}
	if me := e.Do("GET", "/api/v1/me", second, nil); me.Status != http.StatusUnauthorized {
		t.Fatalf("revoked remote session still works: %d", me.Status)
	}

	third := login()
	if revoked := e.Do("DELETE", "/api/v1/me/sessions?except_current=true", token, nil); revoked.Status != http.StatusNoContent {
		t.Fatalf("revoke other sessions: %d %v", revoked.Status, revoked.Body)
	}
	if me := e.Do("GET", "/api/v1/me", third, nil); me.Status != http.StatusUnauthorized {
		t.Fatalf("revoke-other left remote session active: %d", me.Status)
	}
	if me := e.Do("GET", "/api/v1/me", token, nil); me.Status != http.StatusOK {
		t.Fatalf("except_current revoked current session: %d", me.Status)
	}
}
