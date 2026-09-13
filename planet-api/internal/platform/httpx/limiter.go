package httpx

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Limiter：进程内滑动窗口限流（单实例部署足够；key 可为 email/IP+路由）。
type Limiter struct {
	mu     sync.Mutex
	rate   int
	window time.Duration
	hits   map[string][]time.Time
}

func NewLimiter(rate int, window time.Duration) *Limiter {
	return &Limiter{rate: rate, window: window, hits: map[string][]time.Time{}}
}

func (l *Limiter) Allow(key string) bool {
	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()
	list := l.hits[key]
	kept := list[:0]
	for _, t := range list {
		if now.Sub(t) < l.window {
			kept = append(kept, t)
		}
	}
	if len(kept) >= l.rate {
		l.hits[key] = kept
		return false
	}
	l.hits[key] = append(kept, now)
	// 内存防护：先全量清过期键；若仍超硬上限（全为新鲜 key 的洪泛），整体重置为最后手段
	if len(l.hits) > 50_000 {
		for k, v := range l.hits {
			fresh := v[:0]
			for _, t := range v {
				if now.Sub(t) < l.window {
					fresh = append(fresh, t)
				}
			}
			if len(fresh) == 0 {
				delete(l.hits, k)
			} else {
				l.hits[k] = fresh
			}
		}
		if len(l.hits) > 100_000 {
			l.hits = map[string][]time.Time{}
		}
	}
	return true
}

// ClientIP 提取客户端 IP。
// X-Forwarded-For 取**最右侧**可解析项：可信反代（Caddy）追加在末尾，
// 客户端伪造的前置条目不可信——取左侧会被用来给限流器换 key 绕过限流。
func ClientIP(r *http.Request) string {
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		parts := strings.Split(fwd, ",")
		for i := len(parts) - 1; i >= 0; i-- {
			if ip := net.ParseIP(strings.TrimSpace(parts[i])); ip != nil {
				return ip.String()
			}
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func splitComma(s string) []string {
	out := []string{}
	cur := ""
	for _, c := range s {
		if c == ',' {
			out = append(out, trimSpace(cur))
			cur = ""
			continue
		}
		cur += string(c)
	}
	out = append(out, trimSpace(cur))
	return out
}

func trimSpace(s string) string {
	start, end := 0, len(s)
	for start < end && (s[start] == ' ' || s[start] == '\t') {
		start++
	}
	for end > start && (s[end-1] == ' ' || s[end-1] == '\t') {
		end--
	}
	return s[start:end]
}
