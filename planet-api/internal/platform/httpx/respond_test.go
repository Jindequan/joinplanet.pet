package httpx

import (
	"context"
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

func TestDecodeJSONRejectsTrailingValuesAndNull(t *testing.T) {
	for _, body := range []string{`{"name":"Milo"}{}`, "null"} {
		r := httptest.NewRequest("POST", "/", strings.NewReader(body))
		var dst struct {
			Name string `json:"name"`
		}
		if err := DecodeJSON(r, &dst); err == nil {
			t.Fatalf("DecodeJSON accepted invalid body %q", body)
		}
	}
}

func TestWriteAppErrorUnwrapsAppError(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	w := httptest.NewRecorder()
	WriteAppError(w, r, fmt.Errorf("wrapped: %w", ErrNotFound("missing")))
	if w.Code != 404 || !strings.Contains(w.Body.String(), `"RESOURCE_NOT_FOUND"`) {
		t.Fatalf("wrapped app error was not preserved: status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestDecodeJSONRejectsOversizedBody(t *testing.T) {
	body := `{"name":"` + strings.Repeat("x", 1<<20) + `"}`
	r := httptest.NewRequest("POST", "/", strings.NewReader(body))
	var dst map[string]any
	err := DecodeJSON(r, &dst)
	if err == nil {
		t.Fatal("DecodeJSON accepted an oversized request")
	}
	if ae, ok := err.(*AppError); !ok || ae.Code != "PAYLOAD_TOO_LARGE" {
		t.Fatalf("expected PAYLOAD_TOO_LARGE, got %v", err)
	}
}

func TestHandleIgnoresCanceledRequest(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	w := httptest.NewRecorder()
	Handle(w, r, func() (int, any, error) {
		return 0, nil, context.Canceled
	})
	if w.Code != 200 || w.Body.Len() != 0 {
		t.Fatalf("canceled request wrote an error response: status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestHandleMapsMalformedDatabaseIdentifier(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	w := httptest.NewRecorder()
	Handle(w, r, func() (int, any, error) {
		return 0, nil, &pgconn.PgError{Code: "22P02", Message: "invalid input syntax for type uuid"}
	})
	if w.Code != 400 || !strings.Contains(w.Body.String(), `"VALIDATION_FAILED"`) {
		t.Fatalf("malformed identifier escaped the API contract: status=%d body=%s", w.Code, w.Body.String())
	}
}
