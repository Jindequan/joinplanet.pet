package httpx

import (
	"net/http/httptest"
	"testing"
	"time"
)

// 安全回归：X-Forwarded-For 必须取最右侧（可信反代追加项）。
// 取左侧会被客户端伪造的前置条目给限流器换 key，绕过 IP 限流。
func TestClientIPTakesRightmost(t *testing.T) {
	r := httptest.NewRequest("GET", "/x", nil)
	r.RemoteAddr = "203.0.113.9:5555"
	r.Header.Set("X-Forwarded-For", "9.9.9.9, 8.8.8.8, 7.7.7.7")
	if got := ClientIP(r); got != "7.7.7.7" {
		t.Fatalf("rightmost XFF expected 7.7.7.7, got %s", got)
	}
	r.Header.Set("X-Forwarded-For", "9.9.9.9, not-an-ip")
	if got := ClientIP(r); got != "9.9.9.9" {
		t.Fatalf("rightmost parseable expected 9.9.9.9, got %s", got)
	}
	r.Header.Del("X-Forwarded-For")
	if got := ClientIP(r); got != "203.0.113.9" {
		t.Fatalf("direct RemoteAddr expected, got %s", got)
	}
}

func TestLimiterBasicWindow(t *testing.T) {
	l := NewLimiter(2, testWindow())
	if !l.Allow("k") || !l.Allow("k") {
		t.Fatal("first two should pass")
	}
	if l.Allow("k") {
		t.Fatal("third should be blocked")
	}
	if !l.Allow("other") {
		t.Fatal("different key unaffected")
	}
}

func testWindow() (d time.Duration) { return 10 * time.Millisecond }
