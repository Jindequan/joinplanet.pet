// Package integration：全栈集成测试 —— 真实 PostgreSQL + 完整 HTTP 栈。
// 每次运行：建临时库 → 迁移 up → httptest 跑全部用例 → 迁移 down 到 0 → 再 up（验证可逆性）→ 删库。
package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/joinplanet/planet-api/internal/app"
	"github.com/joinplanet/planet-api/internal/platform/db"
	"github.com/joinplanet/planet-api/internal/platform/email"
	"github.com/joinplanet/planet-api/internal/platform/httpx"
	migrations "github.com/joinplanet/planet-api/migrations"
)

type Env struct {
	t          *testing.T
	Server     *httptest.Server
	Pool       *pgxpool.Pool
	baseURL    string
	requestSeq int64
}

func adminURL() string {
	if u := os.Getenv("TEST_DATABASE_URL"); u != "" {
		return u
	}
	return "postgres:///postgres"
}

func NewEnv(t *testing.T) *Env {
	return newEnv(t, true /*relaxed limits*/)
}

// NewEnvStrict 使用生产默认限流（专测限流行为的用例）。
func NewEnvStrict(t *testing.T) *Env {
	return newEnv(t, false)
}

func newEnv(t *testing.T, relaxed bool) *Env {
	t.Helper()
	ctx := context.Background()

	configuredURL := os.Getenv("TEST_DATABASE_URL")
	admin, err := pgx.Connect(ctx, adminURL())
	if err != nil {
		if configuredURL != "" {
			t.Fatalf("TEST_DATABASE_URL is configured but PostgreSQL is unavailable: %v", err)
		}
		t.Skipf("no local postgres for integration tests: %v", err)
	}
	dbName := fmt.Sprintf("planet_test_%d_%d", os.Getpid(), rand.Int31())
	_, err = admin.Exec(ctx, `CREATE DATABASE "`+dbName+`"`)
	if err != nil {
		t.Fatalf("create test db: %v", err)
	}
	u, _ := url.Parse(adminURL())
	u.Path = "/" + dbName
	testURL := u.String()

	if _, err := db.MigrateUp(ctx, migrations.FS, testURL); err != nil {
		t.Fatalf("migrate up: %v", err)
	}

	pool, err := db.NewPool(ctx, testURL)
	if err != nil {
		t.Fatalf("pool: %v", err)
	}
	logWriter := io.Writer(io.Discard)
	if os.Getenv("PLANET_TEST_LOG") == "1" {
		logWriter = os.Stderr
	}
	log := slog.New(slog.NewJSONHandler(logWriter, nil))
	var handler http.Handler
	if relaxed {
		handler = app.New(pool, log, true /*dev codes*/, nil, &email.DevSender{Log: log}, app.AuthLimits{
			EmailPerMinute: httpx.NewLimiter(1000, time.Minute),
			EmailPerDay:    httpx.NewLimiter(1000, 24*time.Hour),
			IPPerHour:      httpx.NewLimiter(10000, time.Hour),
		})
	} else {
		handler = app.New(pool, log, true, nil, &email.DevSender{Log: log})
	}
	srv := httptest.NewServer(handler)

	env := &Env{t: t, Server: srv, Pool: pool, baseURL: srv.URL}
	t.Cleanup(func() {
		srv.Close()
		pool.Close()
		// down 到 0 → 再 up：验证每个迁移可逆（CI 纪律，BACKEND-DESIGN §2.1）
		dctx, dcancel := context.WithTimeout(context.Background(), time.Minute)
		defer dcancel()
		if _, err := db.MigrateDown(dctx, migrations.FS, testURL, 999); err != nil {
			t.Errorf("migrate down all: %v", err)
		}
		if _, err := db.MigrateUp(dctx, migrations.FS, testURL); err != nil {
			t.Errorf("re-migrate up: %v", err)
		}
		_, _ = admin.Exec(dctx, `DROP DATABASE IF EXISTS "`+dbName+`" WITH (FORCE)`)
		_ = admin.Close(dctx)
	})
	return env
}

// DoJSON 以原始 JSON 字符串为请求体（schedule 这类嵌套对象需要精确形状）。
func (e *Env) DoJSON(method, path, token, rawJSON string) *Resp {
	e.t.Helper()
	req, err := http.NewRequest(method, e.baseURL+path, bytes.NewReader([]byte(rawJSON)))
	if err != nil {
		e.t.Fatalf("new request: %v", err)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if method == http.MethodPost {
		req.Header.Set("Idempotency-Key", fmt.Sprintf("test-request-%d", atomic.AddInt64(&e.requestSeq, 1)))
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatalf("%s %s: %v", method, path, err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	out := &Resp{Status: resp.StatusCode, Body: map[string]any{}}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &out.Body)
	}
	if v, ok := out.Body["log"].(map[string]any); ok {
		out.Log = v
	}
	if v, ok := out.Body["usage"].(map[string]any); ok {
		out.Usage = v
	}
	return out
}

// Resp 是解析后的响应。
type Resp struct {
	Status int
	Body   map[string]any
	Log    map[string]any // 顶层 "log"（409 权威记录）
	Usage  map[string]any
}

func (e *Env) Do(method, path, token string, body any) *Resp {
	e.t.Helper()
	var rd io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			e.t.Fatalf("marshal body: %v", err)
		}
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, e.baseURL+path, rd)
	if err != nil {
		e.t.Fatalf("new request: %v", err)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if method == http.MethodPost {
		req.Header.Set("Idempotency-Key", fmt.Sprintf("test-request-%d", atomic.AddInt64(&e.requestSeq, 1)))
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatalf("%s %s: %v", method, path, err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	out := &Resp{Status: resp.StatusCode, Body: map[string]any{}}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &out.Body)
	}
	if v, ok := out.Body["log"].(map[string]any); ok {
		out.Log = v
	}
	if v, ok := out.Body["usage"].(map[string]any); ok {
		out.Usage = v
	}
	return out
}

func (e *Env) doWithHeader(method, path, token string, body any, idempotencyKey string) *Resp {
	e.t.Helper()
	b, err := json.Marshal(body)
	if err != nil {
		e.t.Fatalf("marshal body: %v", err)
	}
	req, err := http.NewRequest(method, e.baseURL+path, bytes.NewReader(b))
	if err != nil {
		e.t.Fatalf("new request: %v", err)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", idempotencyKey)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatalf("%s %s: %v", method, path, err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	out := &Resp{Status: resp.StatusCode, Body: map[string]any{}}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &out.Body)
	}
	if v, ok := out.Body["log"].(map[string]any); ok {
		out.Log = v
	}
	return out
}

func (e *Env) ErrorCode(r *Resp) string {
	e.t.Helper()
	if errObj, ok := r.Body["error"].(map[string]any); ok {
		if c, ok := errObj["code"].(string); ok {
			return c
		}
	}
	return ""
}

var userSeq int64

// NewUser 走真实登录流程拿到 token（dev codes 回显验证码）。
func (e *Env) NewUser(prefix string) (token, userID, email string) {
	seq := atomic.AddInt64(&userSeq, 1)
	email = fmt.Sprintf("%s-%d-%d@test.planet", prefix, seq, rand.Int31())
	rc := e.Do("POST", "/api/v1/auth/request-code", "", map[string]any{"email": email})
	if rc.Status != http.StatusAccepted {
		e.t.Fatalf("request-code: %d %v", rc.Status, rc.Body)
	}
	code, _ := rc.Body["dev_code"].(string)
	if code == "" {
		e.t.Fatal("dev_code missing (DEV_AUTH_CODES off?)")
	}
	vc := e.Do("POST", "/api/v1/auth/verify-code", "", map[string]any{"email": email, "code": code})
	if vc.Status != http.StatusOK {
		e.t.Fatalf("verify-code: %d %v", vc.Status, vc.Body)
	}
	token, _ = vc.Body["token"].(string)
	user, _ := vc.Body["user"].(map[string]any)
	userID, _ = user["id"].(string)
	return token, userID, email
}

// SetupFamily：建圈 + 一只宠物，返回 token/user/family/pet。
func (e *Env) SetupFamily(prefix, petName string) (token, userID, familyID, petID string) {
	e.t.Helper()
	token, userID, _ = e.NewUser(prefix)
	c := e.Do("POST", "/api/v1/families", token, map[string]any{"name": prefix + "圈", "timezone": "Asia/Shanghai"})
	if c.Status != http.StatusCreated {
		e.t.Fatalf("create family: %d %v", c.Status, c.Body)
	}
	family, _ := c.Body["family"].(map[string]any)
	familyID, _ = family["id"].(string)
	p := e.Do("POST", "/api/v1/families/"+familyID+"/pets", token, map[string]any{
		"name": petName, "species": "dog",
	})
	if p.Status != http.StatusCreated {
		e.t.Fatalf("create pet: %d %v", p.Status, p.Body)
	}
	pet, _ := p.Body["pet"].(map[string]any)
	petID, _ = pet["id"].(string)
	return token, userID, familyID, petID
}
