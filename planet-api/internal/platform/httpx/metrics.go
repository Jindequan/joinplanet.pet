package httpx

import (
	"encoding/json"
	"net/http"
	"runtime"
	"sync"
	"sync/atomic"
	"time"
)

// Metrics：进程内请求计数（无外部依赖）。单实例部署下 /internal/stats +
// journald/日志采集就是最小可用观测面：请求量、错误率、在途并发、Go 运行时
// 与连接池水位。计数器只增不减，重启清零。
type Metrics struct {
	start     time.Time
	requests  atomic.Int64
	inFlight  atomic.Int64
	errors    atomic.Int64 // 5xx
	clientErr atomic.Int64 // 4xx
	mu        sync.Mutex
	durations time.Duration
	count2xx  atomic.Int64
}

func NewMetrics() *Metrics {
	return &Metrics{start: time.Now()}
}

// Middleware 记录每个请求（健康检查噪音除外）。
func (m *Metrics) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/healthz" || r.URL.Path == "/readyz" || r.URL.Path == "/internal/stats" {
			next.ServeHTTP(w, r)
			return
		}
		m.requests.Add(1)
		m.inFlight.Add(1)
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		start := time.Now()
		next.ServeHTTP(sw, r)
		m.inFlight.Add(-1)
		elapsed := time.Since(start)
		m.mu.Lock()
		m.durations += elapsed
		m.mu.Unlock()
		switch {
		case sw.status >= 500:
			m.errors.Add(1)
		case sw.status >= 400:
			m.clientErr.Add(1)
		default:
			m.count2xx.Add(1)
		}
	})
}

// Snapshot 返回可 JSON 化的指标快照。poolStat 由调用方注入（pgxpool.Stat），
// 平台层不 import pgxpool，保持 httpx 独立。
func (m *Metrics) Snapshot(poolStat func() map[string]any) map[string]any {
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)
	out := map[string]any{
		"uptime_seconds":   int(time.Since(m.start).Seconds()),
		"requests_total":   m.requests.Load(),
		"in_flight":        m.inFlight.Load(),
		"status_2xx":       m.count2xx.Load(),
		"status_4xx":       m.clientErr.Load(),
		"status_5xx":       m.errors.Load(),
		"goroutines":       runtime.NumGoroutine(),
		"heap_alloc_bytes": mem.HeapAlloc,
		"updated_at":       time.Now().UTC().Format(time.RFC3339),
	}
	if n := m.requests.Load(); n > 0 {
		m.mu.Lock()
		out["latency_avg_ms"] = float64(m.durations.Milliseconds()) / float64(n)
		m.mu.Unlock()
	}
	if poolStat != nil {
		out["pool"] = poolStat()
	}
	return out
}

// WriteStats 输出 /internal/stats 的 JSON（无鉴权：生产只绑回环地址，
// 且内容不含任何标识或参数——只有计数与水位）。
func WriteStats(w http.ResponseWriter, m *Metrics, poolStat func() map[string]any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(m.Snapshot(poolStat))
}
