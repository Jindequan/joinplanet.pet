// Package entitlements：权益判定与配额档位（B1 起即存在，配额从 B2 起生效）。
package entitlements

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/joinplanet/planet-api/internal/contracts"
)

type Service struct{ Pool *pgxpool.Pool }

// UsageSnapshot is the read model exposed to clients. Usage is always owned
// by the User; Family membership is deliberately absent from this response.
func (s *Service) UsageSnapshot(ctx context.Context, userID string, now time.Time) (map[string]any, error) {
	plan, err := s.UserPlan(ctx, userID)
	if err != nil {
		return nil, err
	}
	month := now.UTC().Format("2006-01")
	rows, err := s.Pool.Query(ctx, `
		SELECT resource, period, used
		FROM user_usage
		WHERE user_id = $1 AND ((resource = 'ai_monthly' AND period = $2) OR period = 'current')`, userID, month)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	used := map[string]int64{"pets_created": 0, "storage_bytes": 0, "ai_monthly": 0}
	for rows.Next() {
		var resource, period string
		var value int64
		if err := rows.Scan(&resource, &period, &value); err != nil {
			return nil, err
		}
		if _, ok := used[resource]; ok {
			used[resource] = value
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return map[string]any{
		"plan":   plan.Key,
		"period": month,
		"resources": map[string]any{
			"pets_created":  map[string]any{"used": used["pets_created"], "limit": plan.Pets},
			"storage_bytes": map[string]any{"used": used["storage_bytes"], "limit": plan.StorageBytes},
			"ai_monthly":    map[string]any{"used": used["ai_monthly"], "limit": plan.AIMonthly},
		},
	}, nil
}

var _ contracts.UserQuotaService = (*Service)(nil)

// BestKey 返回用户当前最优权益：'*'（founding）> 'pro' > 'free'。
// 通配 '*' 命中一切 key（BACKEND-DESIGN §5）。
func (s *Service) BestKey(ctx context.Context, userID string) (string, error) {
	// Subscriptions are the V2 billing source. Entitlements remain supported
	// for founding/admin grants during the migration window.
	rows, err := s.Pool.Query(ctx, `
		SELECT candidate.key
		FROM (
			SELECT plan AS key, started_at AS sort_at
			FROM subscriptions
			WHERE user_id = $1 AND status = 'active'
			  AND (expires_at IS NULL OR expires_at > now())
			UNION ALL
			SELECT key, created_at
			FROM entitlements
			WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > now())
		) candidate
		LEFT JOIN plans p ON p.key = candidate.key
		WHERE candidate.key = '*' OR p.key IS NOT NULL
		ORDER BY CASE candidate.key WHEN '*' THEN 100 WHEN 'founder' THEN 90 WHEN 'premium' THEN 80 WHEN 'pro' THEN 70 ELSE 60 END DESC,
		         candidate.sort_at DESC`, userID)
	if err != nil {
		return "free", err
	}
	best := "free"
	var subscribed string
	for rows.Next() {
		if err := rows.Scan(&subscribed); err != nil {
			rows.Close()
			return "free", err
		}
		break
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return "free", err
	}
	rows.Close()
	if subscribed != "" {
		best = subscribed
	}
	return best, nil
}

// Can 判定用户是否持有指定权益（通配或精确匹配且未过期）。
func (s *Service) Can(ctx context.Context, userID, key string) (bool, error) {
	var ok bool
	err := s.Pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM subscriptions
			WHERE user_id = $1 AND plan = $2 AND status = 'active'
			  AND (expires_at IS NULL OR expires_at > now())
			UNION ALL
			SELECT 1 FROM entitlements
			WHERE user_id = $1 AND (key = $2 OR key = '*')
			  AND (expires_at IS NULL OR expires_at > now())
		)`, userID, key).Scan(&ok)
	return ok, err
}

// ListForUser 供 /me 与导出使用。
func (s *Service) ListForUser(ctx context.Context, userID string) ([]map[string]any, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT plan AS key, 'subscription' AS source, expires_at, started_at AS sort_at
		FROM subscriptions WHERE user_id = $1
		UNION ALL
		SELECT key, source, expires_at, created_at AS sort_at
		FROM entitlements WHERE user_id = $1
		ORDER BY sort_at`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var key, source string
		var expires *any
		var sortAt time.Time
		if err := rows.Scan(&key, &source, &expires, &sortAt); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{"key": key, "source": source, "expires_at": expires})
	}
	return out, rows.Err()
}

// PlanForEntitlement：权益 key → 档位限额。
// 运行时事实来源按资源分工，每个资源只有一个可写旋钮：
//   - plans 列（owned_families/members/active_pets/storage_bytes/file_bytes）
//     —— planet-cli plans set 与直接改行都立即生效；
//   - quota_configs.ai_monthly —— plans 表没有的扩展资源走注册表。
// 不做两表之间的时间戳/优先级仲裁：曾用 updated_at 比较决定谁生效，
// "改了哪张表"决定语义，是配额事故的温床。
// '*'（founding）→ pro；未知 key（未来新档位）若表中有同名行则直接生效。
func (s *Service) PlanForEntitlement(ctx context.Context, entitlementKey string) (contracts.Plan, error) {
	planKey := entitlementKey
	switch entitlementKey {
	case "*", "pro":
		planKey = "pro"
	case "premium", "founder":
		planKey = entitlementKey
	case "", "free":
		planKey = "free"
	}
	var p contracts.Plan
	err := s.Pool.QueryRow(ctx, `
		SELECT key, owned_families, members, active_pets, storage_bytes, file_bytes
		FROM plans WHERE key = $1`, planKey).
		Scan(&p.Key, &p.Families, &p.Members, &p.Pets, &p.StorageBytes, &p.FileBytes)
	if err == nil {
		_ = s.Pool.QueryRow(ctx, `
			SELECT quota_limit FROM quota_configs WHERE plan = $1 AND resource = 'ai_monthly'`,
			planKey).Scan(&p.AIMonthly)
		return p, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return contracts.Plan{}, err
	}
	if def, ok := contracts.DefaultPlans[planKey]; ok {
		return def, nil
	}
	return contracts.DefaultPlans["free"], nil
}

// UserPlan resolves the plan for the user, never for a family owner.
func (s *Service) UserPlan(ctx context.Context, userID string) (contracts.Plan, error) {
	key, err := s.BestKey(ctx, userID)
	if err != nil {
		return contracts.Plan{}, err
	}
	return s.PlanForEntitlement(ctx, key)
}

// Reserve updates a materialized user usage row under a user advisory lock.
// It is deliberately generic so storage and AI can use the same atomic path.
func (s *Service) Reserve(ctx context.Context, q contracts.Q, userID, resource, period string, delta, limit int64) (int64, error) {
	if delta == 0 {
		var used int64
		err := q.QueryRow(ctx, `SELECT COALESCE(used, 0) FROM user_usage WHERE user_id=$1 AND resource=$2 AND period=$3`, userID, resource, period).Scan(&used)
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, nil
		}
		return used, err
	}
	if _, err := q.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "quota:"+userID+":"+resource+":"+period); err != nil {
		return 0, err
	}
	var used int64
	err := q.QueryRow(ctx, `
		WITH next_usage AS (
			SELECT COALESCE((
				SELECT used FROM user_usage
				WHERE user_id = $1 AND resource = $2 AND period = $3
			), 0) + $4 AS used
		), changed AS (
			INSERT INTO user_usage (user_id, resource, period, used)
			SELECT $1, $2, $3, used FROM next_usage
			WHERE used >= 0 AND ($5 < 0 OR used <= $5)
			ON CONFLICT (user_id, resource, period) DO UPDATE
			SET used = EXCLUDED.used, updated_at = now()
			RETURNING used
		)
		SELECT used FROM changed`, userID, resource, period, delta, limit).Scan(&used)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, fmt.Errorf("quota exceeded or usage underflow: %s", resource)
	}
	if err != nil {
		return 0, err
	}
	return used, nil
}

func (s *Service) SetUsage(ctx context.Context, q contracts.Q, userID, resource, period string, used int64) error {
	if used < 0 {
		used = 0
	}
	_, err := q.Exec(ctx, `
		INSERT INTO user_usage (user_id, resource, period, used)
		VALUES ($1,$2,$3,$4)
		ON CONFLICT (user_id, resource, period) DO UPDATE
		SET used = EXCLUDED.used, updated_at = now()`, userID, resource, period, used)
	return err
}

// ListPlans 供 CLI /usage 展示。
func (s *Service) ListPlans(ctx context.Context) ([]contracts.Plan, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT key, owned_families, members, active_pets, storage_bytes, file_bytes
		FROM plans ORDER BY key`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []contracts.Plan{}
	for rows.Next() {
		var p contracts.Plan
		if err := rows.Scan(&p.Key, &p.Families, &p.Members, &p.Pets, &p.StorageBytes, &p.FileBytes); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// Grant 由 planet-cli/管理路径调用（B1 内仅 CLI 演示用）。
func (s *Service) Grant(ctx context.Context, userID, key, source string) error {
	_, err := s.Pool.Exec(ctx, `
		INSERT INTO entitlements (user_id, key, source) VALUES ($1, $2, $3)
		ON CONFLICT (user_id, key) DO UPDATE SET source = EXCLUDED.source, expires_at = NULL`, userID, key, source)
	return err
}
