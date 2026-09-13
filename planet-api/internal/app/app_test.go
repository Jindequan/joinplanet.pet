package app

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPublicHealthAndAuthContract(t *testing.T) {
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	databaseRateLimits := false
	h := New(nil, log, true, []string{"https://www.joinplanet.pet", "https://app.joinplanet.pet"}, nil, AuthLimits{
		DatabaseRateLimits: &databaseRateLimits,
	})

	health := httptest.NewRecorder()
	h.ServeHTTP(health, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if health.Code != http.StatusOK || health.Header().Get("Content-Type") != "application/json; charset=utf-8" {
		t.Fatalf("healthz = %d %q", health.Code, health.Body.String())
	}
	var healthBody map[string]string
	if err := json.Unmarshal(health.Body.Bytes(), &healthBody); err != nil || healthBody["status"] != "ok" {
		t.Fatalf("healthz body = %q", health.Body.String())
	}

	auth := httptest.NewRecorder()
	authReq := httptest.NewRequest(http.MethodPost, "/api/v1/auth/request-code", strings.NewReader(`{"email":""}`))
	authReq.Header.Set("Origin", "https://app.joinplanet.pet")
	authReq.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(auth, authReq)
	if auth.Code != http.StatusBadRequest || auth.Header().Get("Access-Control-Allow-Origin") != "https://app.joinplanet.pet" {
		t.Fatalf("auth contract = %d allow-origin=%q body=%q", auth.Code, auth.Header().Get("Access-Control-Allow-Origin"), auth.Body.String())
	}
	var authBody struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(auth.Body.Bytes(), &authBody); err != nil || authBody.Error.Code != "VALIDATION_FAILED" {
		t.Fatalf("auth error body = %q", auth.Body.String())
	}
}
