package httpx

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCORSAllowsMutationMethodsForAllowedOrigin(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	h := CORS([]string{"http://localhost:8082"}, next)

	req := httptest.NewRequest(http.MethodOptions, "/api/v1/families/family-1/notification-prefs", nil)
	req.Header.Set("Origin", "http://localhost:8082")
	req.Header.Set("Access-Control-Request-Method", http.MethodPut)
	req.Header.Set("Access-Control-Request-Headers", "authorization, content-type")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusNoContent)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:8082" {
		t.Fatalf("allow origin = %q", got)
	}
	if got := rec.Header().Get("Access-Control-Allow-Methods"); !strings.Contains(got, "PUT") {
		t.Fatalf("allow methods = %q, want PUT", got)
	}
}

func TestCORSDoesNotGrantUntrustedOrigin(t *testing.T) {
	h := CORS([]string{"http://localhost:8082"}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodOptions, "/api/v1/families/family-1/notification-prefs", nil)
	req.Header.Set("Origin", "https://attacker.example")
	req.Header.Set("Access-Control-Request-Method", http.MethodPut)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("untrusted origin was allowed: %q", got)
	}
}

func TestSafePathRedactsCredentialPathParameters(t *testing.T) {
	tests := []struct {
		path string
		want string
	}{
		{"/api/v1/shares/very-secret-token", "/api/v1/shares/[REDACTED]"},
		{"/api/v1/invite/ABC234XYZ", "/api/v1/invite/[REDACTED]"},
		{"/api/v1/families/family-1", "/api/v1/families/family-1"},
	}
	for _, tt := range tests {
		if got := SafePath(tt.path); got != tt.want {
			t.Errorf("SafePath(%q) = %q, want %q", tt.path, got, tt.want)
		}
	}
}

func TestIsLoopbackRemote(t *testing.T) {
	tests := []struct {
		remote string
		want   bool
	}{
		{"127.0.0.1:8081", true},
		{"[::1]:8081", true},
		{"::1", true},
		{"192.0.2.10:8081", false},
		{"", false},
	}
	for _, tt := range tests {
		if got := IsLoopbackRemote(tt.remote); got != tt.want {
			t.Errorf("IsLoopbackRemote(%q) = %v, want %v", tt.remote, got, tt.want)
		}
	}
}
