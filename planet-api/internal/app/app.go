// Package app 组装全部模块（唯一允许 import 所有模块的位置，ARCHITECTURE §3）。
package app

import (
	_ "time/tzdata" // 内嵌时区库：部署环境与本地行为一致

	"context"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/joinplanet/planet-api/internal/contracts"
	"github.com/joinplanet/planet-api/internal/modules/alerts"
	"github.com/joinplanet/planet-api/internal/modules/carecoord"
	"github.com/joinplanet/planet-api/internal/modules/digest"
	"github.com/joinplanet/planet-api/internal/modules/entitlements"
	"github.com/joinplanet/planet-api/internal/modules/families"
	"github.com/joinplanet/planet-api/internal/modules/handoffs"
	"github.com/joinplanet/planet-api/internal/modules/identity"
	"github.com/joinplanet/planet-api/internal/modules/lifecycle"
	"github.com/joinplanet/planet-api/internal/modules/meds"
	"github.com/joinplanet/planet-api/internal/modules/notify"
	"github.com/joinplanet/planet-api/internal/modules/pets"
	"github.com/joinplanet/planet-api/internal/modules/sharing"
	"github.com/joinplanet/planet-api/internal/modules/tasks"
	"github.com/joinplanet/planet-api/internal/modules/timeline"
	"github.com/joinplanet/planet-api/internal/modules/transfers"
	"github.com/joinplanet/planet-api/internal/platform/clockx"
	"github.com/joinplanet/planet-api/internal/platform/db"
	"github.com/joinplanet/planet-api/internal/platform/email"
	"github.com/joinplanet/planet-api/internal/platform/httpx"
	migrations "github.com/joinplanet/planet-api/migrations"
)

// publicPaths：无需认证的路由；其余 /api/v1/* 一律要求 Bearer session。
var publicPaths = map[string]bool{
	"/api/v1/auth/request-code": true,
	"/api/v1/auth/verify-code":  true,
}

// AuthLimits 允许注入限流器（测试用宽松值；零值 = 生产默认）。
type AuthLimits struct {
	EmailPerMinute *httpx.Limiter
	EmailPerDay    *httpx.Limiter
	IPPerHour      *httpx.Limiter
	// DatabaseRateLimits is explicitly selected by the process environment:
	// production needs a cross-instance invariant; local development and tests
	// must not inherit yesterday's database throttle state.
	DatabaseRateLimits *bool
}

// New 构造完整 HTTP handler（含中间件链与全部路由）。
func New(pool *pgxpool.Pool, log *slog.Logger, devAuthCodes bool, corsOrigins []string, mailer email.Sender, limits ...AuthLimits) http.Handler {
	slog.SetDefault(log) // httpx 意外错误日志走默认 logger
	clock := clockx.New()
	entSvc := &entitlements.Service{Pool: pool}

	idSvc := &identity.Service{
		Repo: &identity.Repo{Pool: pool}, Pool: pool,
		Email: mailer, Clock: clock, Log: log, DevAuthCodes: devAuthCodes,
	}
	idLimits := AuthLimits{
		EmailPerMinute: httpx.NewLimiter(1, time.Minute),
		EmailPerDay:    httpx.NewLimiter(10, 24*time.Hour),
		IPPerHour:      httpx.NewLimiter(30, time.Hour),
	}
	if len(limits) > 0 {
		if limits[0].EmailPerMinute != nil {
			idLimits.EmailPerMinute = limits[0].EmailPerMinute
		}
		if limits[0].EmailPerDay != nil {
			idLimits.EmailPerDay = limits[0].EmailPerDay
		}
		if limits[0].IPPerHour != nil {
			idLimits.IPPerHour = limits[0].IPPerHour
		}
	}
	databaseRateLimits := len(limits) == 0
	if len(limits) > 0 && limits[0].DatabaseRateLimits != nil {
		databaseRateLimits = *limits[0].DatabaseRateLimits
	}
	// DEV_AUTH_CODES is only legal for local development. When the caller also
	// explicitly disables database-backed limits (the local server posture),
	// do not let repeated E2E runs exhaust the process-local IP bucket. Strict
	// integration tests omit this flag and keep the production limiter intact.
	if devAuthCodes && !databaseRateLimits {
		idLimits = AuthLimits{
			EmailPerMinute: httpx.NewLimiter(10_000, time.Minute),
			EmailPerDay:    httpx.NewLimiter(10_000, 24*time.Hour),
			IPPerHour:      httpx.NewLimiter(10_000, time.Hour),
		}
	}
	idHandler := &identity.Handler{
		Svc:                idSvc,
		ListEntitlements:   entSvc.ListForUser,
		UsageSnapshot:      entSvc.UsageSnapshot,
		EmailPerMinute:     idLimits.EmailPerMinute,
		EmailPerDay:        idLimits.EmailPerDay,
		IPPerHour:          idLimits.IPPerHour,
		DatabaseRateLimits: databaseRateLimits,
	}

	familySvc := &families.Service{Repo: &families.Repo{Pool: pool}, Pool: pool, Ent: entSvc}
	familyHandler := &families.Handler{
		Svc: familySvc,
		// 邀请码防穷举：按 IP 限速（49.5bit 熵本身已够，双保险）
		JoinPerHour:          httpx.NewLimiter(10, time.Hour),
		InvitePreviewPerHour: httpx.NewLimiter(30, time.Hour),
	}
	petSvc := &pets.Service{
		Repo: &pets.Repo{Pool: pool}, Pool: pool,
		Members: familySvc, Ent: entSvc,
	}
	timelineSvc := &timeline.Service{Repo: &timeline.Repo{Pool: pool}, Pool: pool, Guard: petSvc, Weight: petSvc.Repo, Members: familySvc, AccessiblePets: petSvc.ListAccessibleForUser}
	medSvc := &meds.Service{
		Repo: &meds.Repo{Pool: pool}, Pool: pool,
		Guard: petSvc, Members: familySvc, Events: timelineSvc,
	}
	textMailer := email.AsTextSender(mailer, log)
	notifySvc := &notify.Service{
		Repo: &notify.Repo{Pool: pool}, Pool: pool, Gate: familySvc,
		Push: &notify.ExpoPushSender{Log: log}, Mail: textMailer, Clock: clock,
	}
	careCoordSvc := &carecoord.Service{
		Repo: &carecoord.Repo{Pool: pool}, Pool: pool, Guard: petSvc, Notifier: notifySvc,
	}
	familySvc.CareRequests = careCoordSvc
	familySvc.Notifier = notifySvc
	petSvc.CareRequests = careCoordSvc
	petSvc.Notifier = notifySvc
	medSvc.CareRequests = careCoordSvc
	medSvc.Notifier = notifySvc
	taskSvc := &tasks.Service{
		Repo: &tasks.Repo{Pool: pool}, Pool: pool,
		Guard: petSvc, Members: familySvc, Events: timelineSvc, CareRequests: careCoordSvc,
		AccessiblePets:     petSvc.ListAccessibleForUser,
		AccessibleFamilies: familySvc.List,
	}
	idHandler.ActivationSummaryReader = func(ctx context.Context, userID string) (identity.ActivationSummary, error) {
		families, err := familySvc.List(ctx, userID)
		if err != nil {
			return identity.ActivationSummary{}, err
		}
		pets, err := petSvc.ListAccessibleForUser(ctx, userID)
		if err != nil {
			return identity.ActivationSummary{}, err
		}
		activePetIDs := make([]string, 0, len(pets))
		for _, pet := range pets {
			if !pet.Archived() {
				activePetIDs = append(activePetIDs, pet.ID)
			}
		}
		plans, err := taskSvc.Repo.CountActivePlanPets(ctx, pool, activePetIDs)
		if err != nil {
			return identity.ActivationSummary{}, err
		}
		_, groups, err := taskSvc.TodayAll(ctx, userID, "", clock.Now())
		if err != nil {
			return identity.ActivationSummary{}, err
		}
		hasTodayItems := false
		for _, group := range groups {
			for _, item := range group.Items {
				if item.Log == nil {
					hasTodayItems = true
					break
				}
			}
			if hasTodayItems {
				break
			}
		}
		return identity.ActivationSummary{
			Families:            len(families),
			ActivePets:          len(activePetIDs),
			PetsWithActivePlans: plans,
			HasTodayItems:       hasTodayItems,
		}, nil
	}
	// P0 主动服务三件套：预警 / 摘要 / 提醒与偏好（全部为新增路由，纯增量）。
	alertSvc := &alerts.Service{
		Repo: &alerts.Repo{Pool: pool}, Pool: pool,
		Members: familySvc,
	}
	digestSvc := &digest.Service{
		Pool: pool, Gate: familySvc, EnabledMembers: familySvc, Meta: familySvc,
		Tasks: taskSvc, Alerts: alertSvc, Runs: &notify.Repo{Pool: pool},
		Mail: textMailer, Clock: clock,
	}
	taskSvc.Notifier = notifySvc
	shareSvc := &sharing.Service{
		Repo: &sharing.Repo{Pool: pool}, Pool: pool,
		Guard: petSvc, Pets: petSvc, Meds: medSvc, Events: timelineSvc, Today: taskSvc,
		Members: familySvc, Clock: clock,
	}
	handoffRepo := &handoffs.Repo{Pool: pool}
	handoffSvc := &handoffs.Service{
		Repo: handoffRepo, Pool: pool,
		Guard: petSvc, Members: familySvc, Today: taskSvc, Notes: timelineSvc, Clock: clock,
	}
	familySvc.HandoffCleaner = handoffRepo

	mux := http.NewServeMux()
	metrics := httpx.NewMetrics()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		if err := db.ValidateCurrent(r.Context(), migrations.FS, pool); err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte("migrations pending: run planet-cli migrate up"))
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ready"))
	})
	// 最小观测面：请求量/错误率/在途并发/时延均值 + Go 运行时 + 连接池水位。
	// 无鉴权（生产只绑回环）；内容只有计数，无标识无参数。
	mux.HandleFunc("GET /internal/stats", func(w http.ResponseWriter, r *http.Request) {
		if !httpx.IsLoopbackRemote(r.RemoteAddr) {
			http.NotFound(w, r)
			return
		}
		httpx.WriteStats(w, metrics, func() map[string]any {
			st := pool.Stat()
			return map[string]any{
				"total_conns":    st.TotalConns(),
				"idle_conns":     st.IdleConns(),
				"acquired_conns": st.AcquiredConns(),
				"max_conns":      st.MaxConns(),
				"acquire_count":  st.AcquireCount(),
				"empty_acquires": st.EmptyAcquireCount(),
				"canceled_acq":   st.CanceledAcquireCount(),
				"acquire_dur_ms": st.AcquireDuration().Milliseconds(),
			}
		})
	})

	idHandler.Mount(mux)
	familyHandler.Mount(mux)
	(&pets.Handler{Svc: petSvc}).Mount(mux)
	(&timeline.Handler{Svc: timelineSvc}).Mount(mux)
	(&meds.Handler{Svc: medSvc}).Mount(mux)
	(&tasks.Handler{Svc: taskSvc, Clock: clock}).Mount(mux)
	transferSvc := &transfers.Service{
		Repo: &transfers.Repo{Pool: pool}, Pool: pool,
		Guard: petSvc, Members: familySvc, Ent: entSvc,
		Events: timelineSvc, Shares: shareSvc,
	}
	(&sharing.Handler{Svc: shareSvc, ViewPerMinute: httpx.NewLimiter(60, time.Minute)}).Mount(mux)
	(&handoffs.Handler{Svc: handoffSvc}).Mount(mux)
	(&carecoord.Handler{Svc: careCoordSvc}).Mount(mux)
	(&lifecycle.Handler{Svc: &lifecycle.Service{Pool: pool}}).Mount(mux)
	(&transfers.Handler{Svc: transferSvc}).Mount(mux)
	(&alerts.Handler{Svc: alertSvc, Clock: clock}).Mount(mux)
	(&digest.Handler{Svc: digestSvc, Clock: clock}).Mount(mux)
	(&notify.Handler{Svc: notifySvc}).Mount(mux)

	// 认证闸门：公开路由直通，其余走 identity 中间件。
	// 链序（外→内）：Recover → RequestID → CORS → authz → AccessLog → mux
	//   - Recover 最外：任何层的 panic 都被兜住
	//   - RequestID 次外：401/500 响应与日志都带 request_id
	//   - CORS 在 authz 外：无 token 的 OPTIONS 预检先被 CORS 短路（204），不打到认证
	//   - authz 在 AccessLog 外：访问日志读到认证后的 user_id
	authz := func(next http.Handler) http.Handler {
		authed := idHandler.Middleware(next)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			p := r.URL.Path
			// /api/v1/shares/{token} 为匿名只读视图（仅 GET；DELETE 撤销仍需认证），
			// 端点内自带限流 + 410 不泄露语义
			isPublicShareView := r.Method == http.MethodGet && strings.HasPrefix(p, "/api/v1/shares/")
			isPublicInvite := r.Method == http.MethodGet && strings.HasPrefix(p, "/api/v1/invite/")
			if publicPaths[p] || isPublicShareView || isPublicInvite || p == "/healthz" || p == "/readyz" || p == "/internal/stats" {
				next.ServeHTTP(w, r)
				return
			}
			authed.ServeHTTP(w, r)
		})
	}

	getUser := func(r *http.Request) string {
		a, _ := contracts.AuthFrom(r.Context())
		return a.UserID
	}

	return httpx.Chain(mux,
		func(next http.Handler) http.Handler { return httpx.Recover(log, next) },
		httpx.RequestID,
		metrics.Middleware,
		func(next http.Handler) http.Handler { return httpx.CORS(corsOrigins, next) },
		authz,
		func(next http.Handler) http.Handler { return httpx.AccessLog(log, getUser, next) },
	)
}

// ProactiveOps：主动服务三件套的直连句柄（planet-cli 的 digest/alerts 运维命令、
// 调度器与集成测试用；与 HTTP 组装共享同一套模块，避免重复拼装）。
type ProactiveOps struct {
	Tasks  *tasks.Service
	Alerts *alerts.Service
	Digest *digest.Service
	Notify *notify.Service
}

func newProactiveOps(pool *pgxpool.Pool, log *slog.Logger, mailer email.Sender) ProactiveOps {
	clock := clockx.New()
	entSvc := &entitlements.Service{Pool: pool}
	familySvc := &families.Service{Repo: &families.Repo{Pool: pool}, Pool: pool, Ent: entSvc}
	petSvc := &pets.Service{Repo: &pets.Repo{Pool: pool}, Pool: pool, Members: familySvc, Ent: entSvc}
	timelineSvc := &timeline.Service{Repo: &timeline.Repo{Pool: pool}, Pool: pool, Guard: petSvc, Weight: petSvc.Repo}
	taskSvc := &tasks.Service{Repo: &tasks.Repo{Pool: pool}, Pool: pool, Guard: petSvc, Members: familySvc, Events: timelineSvc}
	textMailer := email.AsTextSender(mailer, log)
	alertSvc := &alerts.Service{Repo: &alerts.Repo{Pool: pool}, Pool: pool, Members: familySvc}
	digestSvc := &digest.Service{
		Pool: pool, Gate: familySvc, EnabledMembers: familySvc, Meta: familySvc,
		Tasks: taskSvc, Alerts: alertSvc, Runs: &notify.Repo{Pool: pool},
		Mail: textMailer, Clock: clock,
	}
	notifySvc := &notify.Service{
		Repo: &notify.Repo{Pool: pool}, Pool: pool, Gate: familySvc,
		Push: &notify.DevPushSender{Log: log}, Mail: textMailer, Clock: clock,
	}
	careCoordSvc := &carecoord.Service{
		Repo: &carecoord.Repo{Pool: pool}, Pool: pool, Guard: petSvc, Notifier: notifySvc,
	}
	taskSvc.CareRequests = careCoordSvc
	taskSvc.Notifier = notifySvc
	return ProactiveOps{Tasks: taskSvc, Alerts: alertSvc, Digest: digestSvc, Notify: notifySvc}
}

// NewProactiveOps 供 planet-cli（digest / alerts 手动核验）。
func NewProactiveOps(pool *pgxpool.Pool, log *slog.Logger, mailer email.Sender) ProactiveOps {
	return newProactiveOps(pool, log, mailer)
}

// NewScheduler 组装主动服务调度器：cmd/planet-api 在 PLANET_SCHEDULER=1 时
// 以 goroutine 启动（默认关，测试不受影响）。1 分钟节拍，全部一次性语义
// Durable job-run claiming makes this restart-safe.
func NewScheduler(pool *pgxpool.Pool, log *slog.Logger, mailer email.Sender) *notify.Scheduler {
	ops := newProactiveOps(pool, log, mailer)
	entSvc := &entitlements.Service{Pool: pool}
	familySvc := &families.Service{Repo: &families.Repo{Pool: pool}, Pool: pool, Ent: entSvc}
	petSvc := &pets.Service{Repo: &pets.Repo{Pool: pool}, Pool: pool, Members: familySvc, Ent: entSvc}
	timelineSvc := &timeline.Service{Repo: &timeline.Repo{Pool: pool}, Pool: pool, Guard: petSvc, Weight: petSvc.Repo}
	careCoordSvc := &carecoord.Service{
		Repo: &carecoord.Repo{Pool: pool}, Pool: pool, Guard: petSvc, Notifier: ops.Notify,
	}
	petSvc.CareRequests = careCoordSvc
	petSvc.Notifier = ops.Notify
	taskSvc := &tasks.Service{Repo: &tasks.Repo{Pool: pool}, Pool: pool, Guard: petSvc, Members: familySvc, Events: timelineSvc}
	taskSvc.CareRequests = careCoordSvc
	taskSvc.Notifier = ops.Notify
	return &notify.Scheduler{
		Repo: &notify.Repo{Pool: pool}, Pool: pool, Log: log, Clock: clockx.New(),
		Families: familySvc, Due: taskSvc, Risks: taskSvc, CareRequests: careCoordSvc, Alerts: ops.Alerts, Digest: ops.Digest, Notify: ops.Notify,
	}
}
