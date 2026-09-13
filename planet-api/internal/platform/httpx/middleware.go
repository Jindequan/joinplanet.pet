package httpx

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net"
	"net/http"
	"runtime/debug"
	"strings"
	"time"
)

type ctxKey int

const (
	ctxRequestID ctxKey = iota
)

// RequestID 确保每个请求有可追踪 ID（响应头回显，日志与错误契约携带）。
func RequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimSpace(r.Header.Get("X-Request-ID"))
		// Never copy arbitrary user input into logs/response headers. Keep the
		// trusted correlation id small and single-line; otherwise a caller can
		// inject log lines or blow up observability storage.
		if len(id) == 0 || len(id) > 128 || strings.ContainsAny(id, "\r\n") {
			b := make([]byte, 8)
			if _, err := rand.Read(b); err != nil {
				// crypto/rand failure is exceptionally unlikely; use a harmless
				// deterministic fallback rather than returning attacker input.
				id = "request"
			} else {
				id = hex.EncodeToString(b)
			}
		}
		w.Header().Set("X-Request-ID", id)
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxRequestID, id)))
	})
}

func RequestIDFrom(ctx context.Context) string {
	if v, ok := ctx.Value(ctxRequestID).(string); ok {
		return v
	}
	return ""
}

// Recover 捕获 panic → 500 + 完整堆栈日志（禁止静默吞错）。
func Recover(log *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				log.Error("panic recovered",
					"request_id", RequestIDFrom(r.Context()),
					"method", r.Method, "path", SafePath(r.URL.Path),
					"panic", rec, "stack", string(debug.Stack()))
				WriteAppError(w, r, ErrInternal(""))
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// AccessLog 记录每个请求（跳过健康检查噪音）。
func AccessLog(log *slog.Logger, getUser func(*http.Request) string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/healthz" || r.URL.Path == "/readyz" {
			next.ServeHTTP(w, r)
			return
		}
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(sw, r)
		log.Info("http_request",
			"request_id", RequestIDFrom(r.Context()),
			"method", r.Method, "path", SafePath(r.URL.Path),
			"status", sw.status, "duration_ms", time.Since(start).Milliseconds(),
			"user_id", getUser(r),
		)
	})
}

// SafePath removes bearer-like path credentials from logs. Share tokens and
// invite codes are deliberately path parameters, so logging the raw URL
// would turn an otherwise short-lived credential into a durable secret.
func SafePath(path string) string {
	for _, prefix := range []string{"/api/v1/shares/", "/api/v1/invite/"} {
		if strings.HasPrefix(path, prefix) {
			return prefix + "[REDACTED]"
		}
	}
	return path
}

type statusWriter struct {
	http.ResponseWriter
	status      int
	wroteHeader bool
}

func (w *statusWriter) WriteHeader(code int) {
	if w.wroteHeader {
		return
	}
	w.status = code
	w.wroteHeader = true
	w.ResponseWriter.WriteHeader(code)
}

func (w *statusWriter) Write(p []byte) (int, error) {
	if !w.wroteHeader {
		// net/http implicitly commits 200 on the first Write. Preserve a
		// handler's explicit non-200 status while making implicit 404/500 writes
		// visible to access logs through WriteHeader above.
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(p)
}

// CORS 仅回显白名单内的 Origin（原生 APP 不受影响；Web 分享页后续需要）。
func CORS(allowed []string, next http.Handler) http.Handler {
	allow := map[string]bool{}
	for _, o := range allowed {
		allow[o] = true
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			// Vary 必须在响应依赖 Origin 时总是声明——包括未命中白名单的
			// 请求。否则共享缓存可能把"无 CORS 头"的响应发给被允许的来源。
			w.Header().Add("Vary", "Origin")
		}
		if origin != "" && allow[origin] {
			h := w.Header()
			h.Set("Access-Control-Allow-Origin", origin)
			h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-ID, Idempotency-Key")
			h.Set("Access-Control-Max-Age", "600")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func RequireIdempotencyKey(r *http.Request) (string, error) {
	key := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if len(key) < 8 || len(key) > 200 {
		return "", ErrValidation("Idempotency-Key is required and must be 8-200 characters")
	}
	return key, nil
}

// Chain 按序组合中间件。
func Chain(h http.Handler, mws ...func(http.Handler) http.Handler) http.Handler {
	for i := len(mws) - 1; i >= 0; i-- {
		h = mws[i](h)
	}
	return h
}

// BearerToken 提取 Authorization: Bearer xxx。
func BearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if h == "" {
		return ""
	}
	parts := strings.SplitN(h, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

// IsLoopbackRemote is used for operational endpoints that are intentionally
// not part of the user API. A reverse proxy on the same host still reaches the
// application through loopback; direct internet clients do not.
func IsLoopbackRemote(remoteAddr string) bool {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		host = remoteAddr
	}
	ip := net.ParseIP(strings.Trim(host, "[]"))
	return ip != nil && ip.IsLoopback()
}
