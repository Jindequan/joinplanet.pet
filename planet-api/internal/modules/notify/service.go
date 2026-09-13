package notify

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/joinplanet/planet-api/internal/contracts"
	"github.com/joinplanet/planet-api/internal/platform/clockx"
	"github.com/joinplanet/planet-api/internal/platform/email"
	"github.com/joinplanet/planet-api/internal/platform/httpx"
)

type Service struct {
	Repo  *Repo
	Pool  *pgxpool.Pool
	Gate  contracts.MembershipService // /me 与偏好路由的成员判定
	Push  PushSender
	Mail  email.TextSender
	Clock clockx.Clock
}

// NotifyUser 投递一条需要用户采取行动的直接通知。
// Care Request 等调用方先写入自己的持久化收件箱，再调用此方法；只要
// 推送或邮件任一通道送达，就不把这次通知判为失败，避免成功通道被重复投递。
func (s *Service) NotifyUser(ctx context.Context, userID, title, body, kind string) error {
	return s.NotifyUserData(ctx, userID, title, body, kind, nil)
}

func (s *Service) NotifyUserData(ctx context.Context, userID, title, body, kind string, data map[string]string) error {
	delivered, deliveryErr := s.deliverUser(ctx, userID, title, body, kind, data)
	if delivered {
		return nil
	}
	// The care inbox write has already committed by the time this method is
	// called. Preserve the external notification for a later scheduler tick;
	// returning nil means the request mutation is not reported as failed merely
	// because a provider is temporarily unavailable.
	if err := s.Repo.EnqueueNotification(ctx, s.Pool, Notification{
		UserID: userID, Title: title, Body: body, Kind: kind, Data: data,
	}); err != nil {
		if deliveryErr != nil {
			return errors.Join(deliveryErr, err)
		}
		return err
	}
	return nil
}

// deliverUser performs one best-effort pass and never writes the outbox. It is
// shared by the synchronous path and the retry worker so a retry cannot create
// an unbounded chain of retry rows.
func (s *Service) deliverUser(ctx context.Context, userID, title, body, kind string, data map[string]string) (bool, error) {
	contact, err := s.Repo.UserContact(ctx, s.Pool, userID)
	if err != nil {
		return false, err
	}
	tokens, err := s.Repo.TokensForUsers(ctx, s.Pool, []string{userID})
	if err != nil {
		return false, err
	}
	var pushErr error
	pushDelivered := false
	if len(tokens) > 0 {
		tokenValues := make([]string, 0, len(tokens))
		for _, token := range tokens {
			tokenValues = append(tokenValues, token.Token)
		}
		if s.Push == nil {
			pushErr = errors.New("push sender is not configured")
		} else if sender, ok := s.Push.(DataPushSender); ok {
			pushErr = sender.SendData(ctx, tokenValues, title, body, data)
		} else {
			pushErr = s.Push.Send(ctx, tokenValues, title, body)
		}
		pushDelivered = pushErr == nil
	}
	mailErr := error(nil)
	if s.Mail == nil {
		mailErr = errors.New("mail sender is not configured")
	} else {
		mailErr = s.Mail.SendText(ctx, contact.Email, title, body, kind)
	}
	return pushDelivered || mailErr == nil, directDeliveryError(pushDelivered, mailErr == nil, pushErr, mailErr)
}

func directDeliveryError(pushDelivered, mailDelivered bool, pushErr, mailErr error) error {
	if pushDelivered || mailDelivered {
		return nil
	}
	if pushErr != nil {
		return pushErr
	}
	if mailErr != nil {
		return mailErr
	}
	return errors.New("no notification delivery channel succeeded")
}

func validateToken(token, platform string) error {
	token = strings.TrimSpace(token)
	if token == "" || len(token) > 512 {
		return httpx.ErrValidation("token must be 1-512 chars")
	}
	switch platform {
	case "ios", "android", "web":
		return nil
	}
	return httpx.ErrValidation("platform must be ios|android|web")
}

// RegisterToken 登记设备推送令牌（幂等：同 token 重复注册即覆盖）。
func (s *Service) RegisterToken(ctx context.Context, userID, token, platform string) (PushToken, error) {
	token = strings.TrimSpace(token)
	if err := validateToken(token, platform); err != nil {
		return PushToken{}, err
	}
	t, err := s.Repo.UpsertToken(ctx, s.Pool, userID, token, platform)
	return t, httpx.MapDBErr(err)
}

// DeleteToken 移除本人令牌（不存在/越权 → 404）。
func (s *Service) DeleteToken(ctx context.Context, userID, token string) error {
	err := s.Repo.DeleteToken(ctx, s.Pool, userID, strings.TrimSpace(token))
	if errors.Is(err, pgx.ErrNoRows) {
		return httpx.ErrNotFound("push token not found")
	}
	return err
}

// Prefs 查询偏好（成员限定；缺行 = 全开默认值）。
func (s *Service) Prefs(ctx context.Context, familyID, userID string) (Prefs, error) {
	if _, ok, err := s.Gate.ActiveMember(ctx, familyID, userID); err != nil {
		return Prefs{}, err
	} else if !ok {
		return Prefs{}, httpx.ErrNotFound("")
	}
	return s.Repo.PrefsGet(ctx, s.Pool, userID, familyID)
}

// SetPrefs 局部更新偏好（nil = 不改）；成员限定。
func (s *Service) SetPrefs(ctx context.Context, familyID, userID string, reminders, digestC, alerts *bool) (Prefs, error) {
	if _, ok, err := s.Gate.ActiveMember(ctx, familyID, userID); err != nil {
		return Prefs{}, err
	} else if !ok {
		return Prefs{}, httpx.ErrNotFound("")
	}
	current, err := s.Repo.PrefsGet(ctx, s.Pool, userID, familyID)
	if err != nil {
		return Prefs{}, err
	}
	if reminders != nil {
		current.Reminders = *reminders
	}
	if digestC != nil {
		current.Digest = *digestC
	}
	if alerts != nil {
		current.Alerts = *alerts
	}
	out, err := s.Repo.PrefsUpsert(ctx, s.Pool, userID, familyID, current)
	return out, httpx.MapDBErr(err)
}

// NotifyFamily 给圈内开启 pref（reminders|digest|alerts）的成员发推送 + 邮件。
// 每人双通道：有令牌则推送；邮件始终尝试。逐人容错（单人失败不中断其余），
// 任一通道成功即计入 sent；返回逐收件人错误供上层回显/记日志。
func (s *Service) NotifyFamily(ctx context.Context, familyID, pref, title, body string) (int, []contracts.RecipientError) {
	return s.NotifyFamilyData(ctx, familyID, pref, title, body, nil)
}

// NotifyFamilyData is NotifyFamily with optional deep-link data for the
// in-app notification. The ordinary family broadcast remains compatible with
// callers that only need the stable notification kind.
func (s *Service) NotifyFamilyData(ctx context.Context, familyID, pref, title, body string, data map[string]string) (int, []contracts.RecipientError) {
	members, err := s.Repo.MembersWithPref(ctx, s.Pool, familyID, pref)
	if err != nil {
		return 0, []contracts.RecipientError{{To: "family:" + familyID, Error: err.Error()}}
	}
	enabled := make([]MemberPref, 0, len(members))
	userIDs := make([]string, 0, len(members))
	for _, m := range members {
		if m.Enabled {
			enabled = append(enabled, m)
			userIDs = append(userIDs, m.UserID)
		}
	}
	tokensByUser := map[string][]string{}
	if len(userIDs) > 0 {
		tokens, err := s.Repo.TokensForUsers(ctx, s.Pool, userIDs)
		if err != nil {
			return 0, []contracts.RecipientError{{To: "family:" + familyID, Error: "tokens: " + err.Error()}}
		}
		for _, t := range tokens {
			tokensByUser[t.UserID] = append(tokensByUser[t.UserID], t.Token)
		}
	}
	failures := []contracts.RecipientError{}
	sent := 0
	payloadData := make(map[string]string, len(data)+1)
	for key, value := range data {
		payloadData[key] = value
	}
	if payloadData["kind"] == "" {
		payloadData["kind"] = familyNotificationKind(pref)
	}
	for _, m := range enabled {
		ok := false
		if tokens := tokensByUser[m.UserID]; len(tokens) > 0 {
			var perr error
			if s.Push == nil {
				perr = errors.New("push sender is not configured")
			} else if sender, supportsData := s.Push.(DataPushSender); supportsData {
				perr = sender.SendData(ctx, tokens, title, body, payloadData)
			} else {
				perr = s.Push.Send(ctx, tokens, title, body)
			}
			if perr != nil {
				failures = append(failures, contracts.RecipientError{To: m.Email, Error: "push: " + perr.Error()})
			} else {
				ok = true
			}
		}
		var merr error
		if s.Mail == nil {
			merr = errors.New("mail sender is not configured")
		} else {
			merr = s.Mail.SendText(ctx, m.Email, title, body, pref)
		}
		if merr != nil {
			failures = append(failures, contracts.RecipientError{To: m.Email, Error: "mail: " + merr.Error()})
		} else {
			ok = true
		}
		if ok {
			sent++
		} else if err := s.Repo.EnqueueNotification(ctx, s.Pool, Notification{
			UserID: m.UserID, Title: title, Body: body, Kind: payloadData["kind"], Data: payloadData,
		}); err != nil {
			failures = append(failures, contracts.RecipientError{To: m.Email, Error: "outbox: " + err.Error()})
		} else {
			// Durable acceptance is enough to prevent a scheduler job from
			// retrying already-queued recipients and duplicating successful ones.
			sent++
		}
	}
	return sent, failures
}

// DrainOutbox delivers a bounded batch of failed direct notifications. Rows
// are leased before provider I/O, so a second API instance can safely work on
// another batch. Delivery is at-least-once: a crash after provider acceptance
// and before MarkNotificationSent may produce one duplicate on retry.
func (s *Service) DrainOutbox(ctx context.Context, limit int) (sent, parked int, err error) {
	items, err := s.Repo.ClaimNotifications(ctx, s.Pool, limit)
	if err != nil {
		return 0, 0, err
	}
	for _, item := range items {
		eligible, eligibilityErr := s.notificationEligible(ctx, item)
		if eligibilityErr != nil {
			if err := s.Repo.FailNotification(ctx, s.Pool, item, eligibilityErr.Error(), s.now()); err != nil {
				return sent, parked, err
			}
			if item.Attempts >= MaxNotificationAttempts {
				parked++
			}
			continue
		}
		if !eligible {
			// A member can be removed after the request is written but before a
			// provider retry. Do not send stale family data to a former member.
			if err := s.Repo.MarkNotificationSent(ctx, s.Pool, item.ID); err != nil {
				return sent, parked, err
			}
			continue
		}
		delivered, deliveryErr := s.deliverUser(ctx, item.UserID, item.Title, item.Body, item.Kind, item.Data)
		if delivered {
			if err := s.Repo.MarkNotificationSent(ctx, s.Pool, item.ID); err != nil {
				return sent, parked, err
			}
			sent++
			continue
		}
		if deliveryErr == nil {
			deliveryErr = errors.New("no notification delivery channel succeeded")
		}
		if err := s.Repo.FailNotification(ctx, s.Pool, item, deliveryErr.Error(), s.now()); err != nil {
			return sent, parked, err
		}
		if item.Attempts >= MaxNotificationAttempts {
			parked++
		}
	}
	return sent, parked, nil
}

func (s *Service) now() time.Time {
	if s.Clock != nil {
		return s.Clock.Now()
	}
	return time.Now().UTC()
}

func (s *Service) notificationEligible(ctx context.Context, n Notification) (bool, error) {
	familyID := n.Data["family_id"]
	if familyID == "" || s.Gate == nil {
		return true, nil
	}
	_, ok, err := s.Gate.ActiveMember(ctx, familyID, n.UserID)
	return ok, err
}

// familyNotificationKind gives ordinary family broadcasts a stable in-app
// destination. They are not actionable handoffs, so they intentionally do
// not receive a notification category or action buttons; tapping them simply
// returns the member to Today.
func familyNotificationKind(pref string) string {
	switch pref {
	case "reminders":
		return "care_reminder"
	case "digest":
		return "care_digest"
	case "alerts":
		return "care_alert"
	default:
		return "care_alert"
	}
}
