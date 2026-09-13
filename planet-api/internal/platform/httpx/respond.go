package httpx

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if v != nil {
		_ = json.NewEncoder(w).Encode(v)
	}
}

// DecodeJSON 严格解码：未知字段报错、大小限制、JSON 语法错误 → VALIDATION_FAILED。
// 空请求体视为合法（无字段可解码），适配 DELETE/POST 无体调用。
func DecodeJSON(r *http.Request, dst any) error {
	const maxBodyBytes = 1 << 20
	body, err := io.ReadAll(io.LimitReader(r.Body, maxBodyBytes+1))
	if err != nil {
		return ErrValidation(err.Error())
	}
	if len(body) > maxBodyBytes {
		return NewAppError(http.StatusRequestEntityTooLarge, "PAYLOAD_TOO_LARGE", "request body too large")
	}
	if len(bytes.TrimSpace(body)) == 0 {
		return nil
	}
	if bytes.Equal(bytes.TrimSpace(body), []byte("null")) {
		return ErrValidation("request body must be a JSON object")
	}
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return ErrValidation(err.Error())
	}
	// Decode must consume exactly one JSON value. Without this check a valid
	// object followed by arbitrary bytes would be accepted silently.
	var extra any
	if err := dec.Decode(&extra); err != io.EOF {
		if err == nil {
			return ErrValidation("request body must contain one JSON value")
		}
		return ErrValidation("invalid trailing JSON")
	}
	return nil
}

// MapDBErr 将 repo 层错误映射为契约错误。数据库永远不能把客户端的
// malformed id、约束冲突泄露成 500。
func MapDBErr(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound("")
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "22P02":
			return ErrValidation("invalid identifier")
		case "23505":
			return NewAppError(http.StatusConflict, "RESOURCE_CONFLICT", "resource already exists")
		case "23503", "23514":
			return ErrValidation("resource violates a business constraint")
		}
	}
	return err
}

// Handle 是 handler 统一出口：错误一律经 WriteAppError。
// 非 AppError 的意外错误必须先落日志（带 request_id），再以 INTERNAL 返回。
func Handle(w http.ResponseWriter, r *http.Request, fn func() (int, any, error)) {
	status, v, err := fn()
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return
		}
		// Every handler is a public boundary. Keep malformed identifiers and
		// database constraint errors inside the API error contract even when a
		// service path forgot to map a repository error locally.
		err = MapDBErr(err)
		var ae *AppError
		if !errors.As(err, &ae) {
			slog.Error("unhandled error",
				"request_id", RequestIDFrom(r.Context()),
				"err", err.Error())
		}
		WriteAppError(w, r, err)
		return
	}
	WriteJSON(w, status, v)
}
