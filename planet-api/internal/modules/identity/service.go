package identity

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"log/slog"

	"github.com/joinplanet/planet-api/internal/platform/clockx"
	"github.com/joinplanet/planet-api/internal/platform/db"
	"github.com/joinplanet/planet-api/internal/platform/email"
	"github.com/joinplanet/planet-api/internal/platform/httpx"
)

const (
	codeTTL     = 10 * time.Minute
	sessionTTL  = 90 * 24 * time.Hour
	maxAttempts = 5
)

var emailRe = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)

type Service struct {
	Repo         *Repo
	Pool         *pgxpool.Pool
	Email        email.Sender
	Clock        clockx.Clock
	Log          *slog.Logger
	DevAuthCodes bool // 验证码回显（仅开发）
}

func hashHex(v string) string {
	sum := sha256.Sum256([]byte(v))
	return hex.EncodeToString(sum[:])
}

func randomToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func randomCode() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

func NormalizeEmail(s string) (string, error) {
	e := strings.TrimSpace(strings.ToLower(s))
	if !emailRe.MatchString(e) || len(e) > 254 {
		return "", httpx.ErrValidation("invalid email")
	}
	return e, nil
}

// RequestCode 生成并发送验证码；始终返回 sent=true（不泄露邮箱是否注册）。
func (s *Service) RequestCode(ctx context.Context, rawEmail, ip string) (devCode string, err error) {
	emailAddr, err := NormalizeEmail(rawEmail)
	if err != nil {
		return "", err
	}
	code, err := randomCode()
	if err != nil {
		return "", err
	}
	now := s.Clock.Now()
	var codeID string
	var unavailable bool
	err = db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		// Serialize issuance per email. The process-local HTTP limiter is not a
		// database invariant and cannot prevent two concurrent requests (or two
		// API instances) from both creating a pending code.
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "login-code:"+emailAddr); err != nil {
			return err
		}
		var status string
		// deleted_at 过滤：注销用户的邮箱按 uq_users_email(部分索引) 设计可复用
		// 重新注册；不过滤会把"新注册"误判成"不可用账号"并发假成功响应。
		if scanErr := tx.QueryRow(ctx, `SELECT status FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL`, emailAddr).Scan(&status); scanErr == nil && status != "active" {
			// Keep the public response indistinguishable from a normal request,
			// but do not issue a credential to suspended/deleted accounts.
			unavailable = true
			return nil
		} else if scanErr != nil && !errors.Is(scanErr, pgx.ErrNoRows) {
			return scanErr
		}
		if err := s.Repo.ConsumePendingCodes(ctx, tx, emailAddr); err != nil {
			return err
		}
		var err error
		codeID, err = s.Repo.InsertLoginCode(ctx, tx, emailAddr, hashHex(code), now.Add(codeTTL), ip)
		return err
	})
	if err != nil {
		return "", err
	}
	if unavailable {
		return "", nil
	}
	if sendErr := s.Email.SendLoginCode(ctx, emailAddr, code); sendErr != nil {
		// Do not leave a usable code in production when delivery failed. A
		// successful-looking 202 causes needless retries and can strand the
		// user behind the per-email rate limit.
		s.Log.Error("send login code failed", "err", sendErr, "request_id", httpx.RequestIDFrom(ctx))
		if !s.DevAuthCodes {
			// The code was persisted before delivery because the mail provider is
			// an external side effect. Revoke it on failure so a retry is not
			// blocked by the per-email pending-code rule and a leaked provider
			// payload cannot still authenticate the account.
			if revokeErr := s.Repo.RevokeLoginCode(ctx, s.Pool, codeID); revokeErr != nil {
				s.Log.Error("revoke undelivered login code failed", "err", revokeErr, "request_id", httpx.RequestIDFrom(ctx))
			}
			return "", httpx.ErrInternal("could not deliver login code")
		}
	}
	if s.DevAuthCodes {
		return code, nil
	}
	return "", nil
}

type VerifyResult struct {
	Token     string
	ExpiresAt time.Time
	User      UserRow
}

// VerifyCode 原子消费验证码；登录即注册。
func (s *Service) VerifyCode(ctx context.Context, rawEmail, code, device string) (VerifyResult, error) {
	var res VerifyResult
	emailAddr, err := NormalizeEmail(rawEmail)
	if err != nil {
		return res, err
	}
	code = strings.TrimSpace(code)
	if len(code) != 6 {
		return res, httpx.ErrValidation("invalid code format")
	}

	now := s.Clock.Now()
	err = db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		row, err := s.Repo.LatestPendingCode(ctx, tx, emailAddr)
		if errors.Is(err, pgx.ErrNoRows) {
			return httpx.ErrUnauthenticated("invalid or expired code")
		}
		if err != nil {
			return err
		}
		if subtle.ConstantTimeCompare([]byte(hashHex(code)), []byte(row.CodeHash)) != 1 ||
			row.ExpiresAt.Before(now) || row.Attempts >= maxAttempts {
			_ = s.Repo.FailCodeAttempt(ctx, tx, row.ID)
			return httpx.ErrUnauthenticated("invalid or expired code")
		}
		ok, err := s.Repo.ConsumeCode(ctx, tx, row.ID)
		if err != nil {
			return err
		}
		if !ok { // 并发竞争：码刚被另一请求消费
			return httpx.ErrUnauthenticated("invalid or expired code")
		}

		user, err := s.Repo.UserByEmail(ctx, tx, emailAddr)
		if errors.Is(err, pgx.ErrNoRows) {
			display := strings.SplitN(emailAddr, "@", 2)[0]
			user, err = s.Repo.CreateUser(ctx, tx, emailAddr, display)
		}
		if err != nil {
			return err
		}
		if user.Status != "active" {
			return httpx.ErrUnauthenticated("account is unavailable")
		}

		token, tokenErr := randomToken()
		if tokenErr != nil {
			return tokenErr
		}
		sess, err := s.Repo.CreateSession(ctx, tx, user.ID, hashHex(token), truncate(device, 120), now.Add(sessionTTL))
		if err != nil {
			return err
		}
		res = VerifyResult{Token: token, ExpiresAt: sess.ExpiresAt, User: user}
		return nil
	})
	return res, err
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

// Authenticate 用于 authn 中间件：token → 用户。
func (s *Service) Authenticate(ctx context.Context, token string) (UserRow, SessionRow, error) {
	if token == "" {
		return UserRow{}, SessionRow{}, httpx.ErrUnauthenticated("")
	}
	sess, user, err := s.Repo.SessionByToken(ctx, s.Pool, hashHex(token))
	if errors.Is(err, pgx.ErrNoRows) {
		return UserRow{}, SessionRow{}, httpx.ErrUnauthenticated("invalid or expired session")
	}
	if err != nil {
		return UserRow{}, SessionRow{}, err
	}
	if user.Status != "active" {
		return UserRow{}, SessionRow{}, httpx.ErrUnauthenticated("account is unavailable")
	}
	if err := s.Repo.ExtendSession(ctx, s.Pool, sess.ID); err != nil {
		s.Log.Warn("session extend failed", "err", err)
	}
	return user, sess, nil
}

func (s *Service) Logout(ctx context.Context, sessionID string) error {
	return s.Repo.RevokeSession(ctx, s.Pool, sessionID)
}

func (s *Service) ListSessions(ctx context.Context, userID, currentSessionID string) ([]SessionInfo, error) {
	return s.Repo.ListSessions(ctx, s.Pool, userID, currentSessionID)
}

func (s *Service) RevokeOwnedSession(ctx context.Context, userID, sessionID string) error {
	return s.Repo.RevokeOwnedSession(ctx, s.Pool, userID, sessionID)
}

func (s *Service) RevokeOtherSessions(ctx context.Context, userID, currentSessionID string) error {
	return s.Repo.RevokeOtherSessions(ctx, s.Pool, userID, currentSessionID)
}

func (s *Service) UpdateName(ctx context.Context, userID, name string) (UserRow, error) {
	name = strings.TrimSpace(name)
	if name == "" || len(name) > 60 {
		return UserRow{}, httpx.ErrValidation("display_name must be 1-60 chars")
	}
	u, err := s.Repo.UpdateUserName(ctx, s.Pool, userID, name)
	return u, httpx.MapDBErr(err)
}

func (s *Service) UpdateLocale(ctx context.Context, userID, locale string) (UserRow, error) {
	locale = strings.TrimSpace(locale)
	if locale != "en" && locale != "zh-CN" {
		return UserRow{}, httpx.ErrValidation("locale must be en or zh-CN")
	}
	u, err := s.Repo.UpdateUserLocale(ctx, s.Pool, userID, locale)
	return u, httpx.MapDBErr(err)
}

func (s *Service) Preferences(ctx context.Context, userID string) (UserPreferences, error) {
	return s.Repo.GetPreferences(ctx, s.Pool, userID)
}

func (s *Service) UpdatePreferences(ctx context.Context, userID string, familyID, petID *string) (UserPreferences, error) {
	var out UserPreferences
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		if familyID != nil && *familyID != "" {
			var ok bool
			if err := tx.QueryRow(ctx, `
				SELECT EXISTS (
					SELECT 1 FROM family_memberships m
					JOIN families f ON f.id = m.family_id AND f.deleted_at IS NULL
					WHERE m.family_id = $1 AND m.user_id = $2 AND m.status = 'active' AND m.ended_at IS NULL AND m.deleted_at IS NULL
				)`, *familyID, userID).Scan(&ok); err != nil {
				return err
			} else if !ok {
				return httpx.ErrNotFound("default family is not accessible")
			}
		}
		if petID != nil && *petID != "" {
			var ok bool
			if err := tx.QueryRow(ctx, `
				SELECT EXISTS (
					SELECT 1 FROM pet_ownerships po
					WHERE po.pet_id = $1 AND po.owner_user_id = $2 AND po.valid_to IS NULL AND po.deleted_at IS NULL
					UNION ALL
					SELECT 1 FROM family_pet_links fp
					JOIN family_memberships m ON m.family_id = fp.family_id AND m.user_id = $2 AND m.status = 'active' AND m.ended_at IS NULL AND m.deleted_at IS NULL
					JOIN families f ON f.id = fp.family_id AND f.deleted_at IS NULL
					WHERE fp.pet_id = $1 AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL
					UNION ALL
					SELECT 1 FROM pet_user_delegations g
					WHERE g.pet_id = $1 AND g.user_id = $2 AND g.revoked_at IS NULL AND g.deleted_at IS NULL
					  AND (g.expires_at IS NULL OR g.expires_at > now())
				)`, *petID, userID).Scan(&ok); err != nil {
				return err
			} else if !ok {
				return httpx.ErrNotFound("default pet is not accessible")
			}
		}
		if familyID != nil && *familyID != "" && petID != nil && *petID != "" {
			var linked bool
			if err := tx.QueryRow(ctx, `
				SELECT EXISTS (
					SELECT 1 FROM family_pet_links
					WHERE family_id = $1 AND pet_id = $2
					  AND unlinked_at IS NULL AND deleted_at IS NULL
				)`, *familyID, *petID).Scan(&linked); err != nil {
				return err
			} else if !linked {
				return httpx.ErrValidation("default pet must belong to default family")
			}
		}
		var err error
		out, err = s.Repo.UpdatePreferences(ctx, tx, userID, familyID, petID)
		return err
	})
	return out, httpx.MapDBErr(err)
}
