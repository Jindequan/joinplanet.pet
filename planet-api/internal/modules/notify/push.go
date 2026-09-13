// Package notify：推送令牌 / 通知偏好 / Expo 推送（P0）。
// 调度器（reminder/digest/alerts 三个 job）也在这里，由 PLANET_SCHEDULER=1 启动。
package notify

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"
)

// PushSender 抽象 Expo 推送（net/http，零新依赖）。
type PushSender interface {
	Send(ctx context.Context, tokens []string, title, body string) error
}

type DataPushSender interface {
	SendData(ctx context.Context, tokens []string, title, body string, data map[string]string) error
}

// DevPushSender 仅打日志（本地/测试；调度器默认关闭，测试不受影响）。
type DevPushSender struct{ Log *slog.Logger }

func (d *DevPushSender) Send(_ context.Context, tokens []string, title, body string) error {
	if d.Log != nil {
		d.Log.Warn("dev push sender: not sent", "token_count", len(tokens))
	}
	return nil
}

func (d *DevPushSender) SendData(_ context.Context, tokens []string, _ string, _ string, data map[string]string) error {
	if d.Log != nil {
		d.Log.Warn("dev push sender: not sent", "token_count", len(tokens), "kind", data["kind"])
	}
	return nil
}

// pushTokenFingerprint is only for correlating a failed delivery in logs. The
// token itself is a notification credential and must never be written to logs.
func pushTokenFingerprint(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:6])
}

// ExpoPushSender：POST https://exp.host/--/api/v2/push/send（JSON 消息数组）。
// 单条票据失败（invalid token 等）记日志；只有全部票据失败时才返回 error，
// 让上层可以启用备用通道或让 durable job 在下一轮重试。
type ExpoPushSender struct {
	Endpoint string // 测试可指向 httptest；空 = Expo 官方端点
	Client   *http.Client
	Log      *slog.Logger
}

type expoTicket struct {
	Status  string `json:"status"`
	ID      string `json:"id"`
	Message string `json:"message"`
	Details struct {
		Error string `json:"error"`
	} `json:"details"`
}

func (e *ExpoPushSender) Send(ctx context.Context, tokens []string, title, body string) error {
	return e.SendData(ctx, tokens, title, body, nil)
}

func (e *ExpoPushSender) SendData(ctx context.Context, tokens []string, title, body string, data map[string]string) error {
	if len(tokens) == 0 {
		return nil
	}
	type msg struct {
		To         string            `json:"to"`
		Title      string            `json:"title"`
		Body       string            `json:"body"`
		Data       map[string]string `json:"data,omitempty"`
		CategoryID string            `json:"categoryId,omitempty"`
		ChannelID  string            `json:"channelId,omitempty"`
		// Keep each actionable care item in its own iOS notification thread.
		// Without this, SpringBoard groups simultaneous requests into one
		// summary card and hides the per-request responsibility actions.
		ThreadID string `json:"threadId,omitempty"`
	}
	msgs := make([]msg, 0, len(tokens))
	categoryID := ""
	channelID := ""
	threadID := ""
	if data != nil {
		switch data["kind"] {
		case "care_request":
			categoryID = "care_request"
			threadID = data["care_request_id"]
		case "care_handoff_batch":
			categoryID = "care_handoff_batch"
			threadID = data["care_batch_id"]
		}
	}
	if data != nil && data["kind"] != "" {
		channelID = "care_coordination"
	}
	for _, t := range tokens {
		msgs = append(msgs, msg{
			To:         t,
			Title:      title,
			Body:       body,
			Data:       data,
			CategoryID: categoryID,
			ChannelID:  channelID,
			ThreadID:   threadID,
		})
	}
	payload, err := json.Marshal(msgs)
	if err != nil {
		return err
	}
	endpoint := e.Endpoint
	if endpoint == "" {
		endpoint = "https://exp.host/--/api/v2/push/send"
	}
	client := e.Client
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("expo push: status %d", resp.StatusCode)
	}
	// Expo's v2 endpoint returns {"data":[...]} (older test doubles and
	// self-hosted gateways may return the positional array directly). Accept
	// both shapes, but keep the positional count check below: a partial or
	// reordered response must never be reported as a successful delivery.
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("expo push: read response: %w", err)
	}
	var tickets []expoTicket
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) > 0 && trimmed[0] == '[' {
		err = json.Unmarshal(trimmed, &tickets)
	} else {
		var envelope struct {
			Data []expoTicket `json:"data"`
		}
		err = json.Unmarshal(trimmed, &envelope)
		tickets = envelope.Data
	}
	if err != nil {
		if e.Log != nil {
			e.Log.Warn("expo push: unreadable response", "err", err.Error())
		}
		return fmt.Errorf("expo push: unreadable response: %w", err)
	}
	errorTickets := 0
	if e.Log != nil {
		for i, tk := range tickets {
			if tk.Status == "error" {
				errorTickets++
				tokenFingerprint := "unknown"
				if i < len(tokens) {
					tokenFingerprint = pushTokenFingerprint(tokens[i])
				}
				e.Log.Warn("expo push ticket failed",
					"token_fingerprint", tokenFingerprint, "ticket_index", i,
					"error", tk.Details.Error, "message", tk.Message)
			}
		}
	} else {
		for _, tk := range tickets {
			if tk.Status == "error" {
				errorTickets++
			}
		}
	}
	if len(tickets) != len(tokens) {
		// Expo tickets are positional: a count mismatch means delivery cannot be
		// correlated safely, so do not report this batch as successful.
		return fmt.Errorf("expo push: ticket count %d does not match token count %d", len(tickets), len(tokens))
	}
	if errorTickets == len(tickets) && errorTickets > 0 {
		return fmt.Errorf("expo push: all %d tickets failed", errorTickets)
	}
	return nil
}
