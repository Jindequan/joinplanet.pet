// Package config 解析并校验环境变量；错误即启动失败（fail-fast）。
package config

import (
	"fmt"
	"net"
	"net/url"
	"os"
	"strings"
)

type Config struct {
	Env          string // dev | prod
	Bind         string
	DatabaseURL  string
	BaseURL      string
	LogLevel     string
	DevAuthCodes bool // 开发模式：验证码回显（生产必须为 false）
	ResendAPIKey string
	CORSOrigins  []string
}

var requiredProductionOrigins = []string{
	"https://www.joinplanet.pet",
	"https://app.joinplanet.pet",
}

func Load() (*Config, error) {
	c := &Config{
		Env:          getenv("PLANET_ENV", "dev"),
		Bind:         getenv("BIND", ":8081"),
		DatabaseURL:  os.Getenv("DATABASE_URL"),
		BaseURL:      getenv("BASE_URL", "http://localhost:8081"),
		LogLevel:     strings.ToLower(getenv("LOG_LEVEL", "info")),
		DevAuthCodes: os.Getenv("DEV_AUTH_CODES") == "1",
		ResendAPIKey: os.Getenv("RESEND_API_KEY"),
	}
	// 生产姿态（DB 限流、CORS 白名单、DevAuthCodes 防护）全部由 Env 派生。
	// 枚举必须显式校验：拼错 "production" 会被当成 dev 静默降级。
	switch c.Env {
	case "dev", "prod":
	default:
		return nil, fmt.Errorf("config: PLANET_ENV must be dev or prod, got %q", c.Env)
	}
	if c.DatabaseURL == "" {
		return nil, fmt.Errorf("config: DATABASE_URL is required")
	}
	if origins := os.Getenv("CORS_ORIGINS"); origins != "" {
		for _, o := range strings.Split(origins, ",") {
			if o = strings.TrimSpace(o); o != "" {
				c.CORSOrigins = append(c.CORSOrigins, o)
			}
		}
	}
	// Keep a safe local-Web default so `make run` works without requiring a
	// second CORS setting. Device/LAN development is supplied by scripts/dev.sh
	// through an explicit CORS_ORIGINS value; production remains opt-in.
	if len(c.CORSOrigins) == 0 && c.Env != "prod" {
		c.CORSOrigins = []string{
			"http://localhost:4173",
			"http://127.0.0.1:4173",
			"http://localhost:5173",
			"http://127.0.0.1:5173",
			"http://localhost:8082",
			"http://127.0.0.1:8082",
		}
	}
	if c.Env == "prod" && c.DevAuthCodes {
		return nil, fmt.Errorf("config: DEV_AUTH_CODES=1 is not allowed in prod")
	}
	if c.Env == "prod" {
		if c.ResendAPIKey == "" {
			return nil, fmt.Errorf("config: RESEND_API_KEY is required in prod")
		}
		if len(c.CORSOrigins) == 0 {
			return nil, fmt.Errorf("config: CORS_ORIGINS is required in prod")
		}
		base, err := url.Parse(c.BaseURL)
		if err != nil || base.Scheme != "https" || base.Host == "" {
			return nil, fmt.Errorf("config: BASE_URL must be an https URL in prod")
		}
		for _, origin := range c.CORSOrigins {
			u, err := url.Parse(origin)
			if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || strings.ContainsAny(u.Hostname(), "*") || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
				return nil, fmt.Errorf("config: production CORS origin must be an https origin, got %q", origin)
			}
		}
		for _, required := range requiredProductionOrigins {
			found := false
			for _, origin := range c.CORSOrigins {
				if origin == required {
					found = true
					break
				}
			}
			if !found {
				return nil, fmt.Errorf("config: CORS_ORIGINS must include %s in prod", required)
			}
		}
		if !loopbackBind(c.Bind) {
			return nil, fmt.Errorf("config: BIND must use a loopback address in prod, got %q", c.Bind)
		}
	}
	return c, nil
}

func loopbackBind(bind string) bool {
	host, _, err := net.SplitHostPort(bind)
	if err != nil {
		return false
	}
	ip := net.ParseIP(strings.Trim(host, "[]"))
	return ip != nil && ip.IsLoopback()
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
