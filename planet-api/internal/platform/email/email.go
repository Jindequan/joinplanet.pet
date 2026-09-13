// Package email 抽象邮件发送：开发只打日志，生产走 Resend REST（无 SDK 依赖）。
package email

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"time"
)

type Sender interface {
	SendLoginCode(ctx context.Context, to, code string) error
}

// TextSender 通用文本邮件（P0 主动服务：digest / 提醒 / 预警；现有实现均已实现）。
type TextSender interface {
	SendText(ctx context.Context, to, subject, text, tag string) error
}

// AsTextSender 把 Sender 适配为 TextSender（现有实现均满足；未实现时回退 DevSender）。
func AsTextSender(s Sender, log *slog.Logger) TextSender {
	if t, ok := s.(TextSender); ok {
		return t
	}
	return &DevSender{Log: log}
}

// DevSender 仅打日志（本地/演示环境；配合 DEV_AUTH_CODES 使用）。
type DevSender struct{ Log *slog.Logger }

func (d *DevSender) SendLoginCode(_ context.Context, to, code string) error {
	d.Log.Warn("dev email sender: login code not sent", "to", to, "code", code)
	return nil
}

func (d *DevSender) SendText(_ context.Context, to, subject, text, tag string) error {
	d.Log.Warn("dev email sender: text mail not sent", "to", to, "subject", subject, "tag", tag)
	return nil
}

// ResendSender 通过 Resend HTTP API 发送（生产）。
type ResendSender struct {
	APIKey string
	From   string // 例：PLANET <code@joinplanet.pet>
	Client *http.Client
}

func (r *ResendSender) SendLoginCode(ctx context.Context, to, code string) error {
	body := fmt.Sprintf(`{"from":%q,"to":[%q],"subject":"PLANET 登录验证码","text":"你的验证码是 %s，10 分钟内有效。如非本人操作请忽略。","tags":[{"name":"kind","value":"login_code"}]}`, r.From, to, code)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.resend.com/emails", bytes.NewBufferString(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+r.APIKey)
	req.Header.Set("Content-Type", "application/json")
	client := r.Client
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("resend: status %d", resp.StatusCode)
	}
	return nil
}

// SendText 通过 Resend 发送任意文本邮件（digest/提醒/预警；P0 主动服务）。
// payload 用 json.Marshal 组装（正文中可能含引号/换行，不能靠 %q 拼 JSON）。
func (r *ResendSender) SendText(ctx context.Context, to, subject, text, tag string) error {
	payload, err := json.Marshal(map[string]any{
		"from":    r.From,
		"to":      []string{to},
		"subject": subject,
		"text":    text,
		"tags":    []map[string]string{{"name": "kind", "value": tag}},
	})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+r.APIKey)
	req.Header.Set("Content-Type", "application/json")
	client := r.Client
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("resend: status %d", resp.StatusCode)
	}
	return nil
}

// NewSender 按环境选择实现；生产无 key 直接失败（fail-fast）。
func NewSender(log *slog.Logger, apiKey, env string) (Sender, error) {
	if env == "prod" {
		if apiKey == "" {
			return nil, fmt.Errorf("email: RESEND_API_KEY required in prod")
		}
		from := os.Getenv("MAIL_FROM")
		if from == "" {
			from = "PLANET <code@mail.joinplanet.pet>"
		}
		return &ResendSender{APIKey: apiKey, From: from}, nil
	}
	return &DevSender{Log: log}, nil
}
