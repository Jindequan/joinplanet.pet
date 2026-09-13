// planet-api：PLANET APP 后端 HTTP 服务入口。
package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joinplanet/planet-api/internal/app"
	"github.com/joinplanet/planet-api/internal/platform/config"
	"github.com/joinplanet/planet-api/internal/platform/db"
	"github.com/joinplanet/planet-api/internal/platform/email"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		slog.Error("config", "err", err)
		os.Exit(1)
	}

	level := slog.LevelInfo
	switch cfg.LogLevel {
	case "debug":
		level = slog.LevelDebug
	case "warn":
		level = slog.LevelWarn
	}
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level}))
	slog.SetDefault(log)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := db.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Error("db connect", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	mailer, err := email.NewSender(log, cfg.ResendAPIKey, cfg.Env)
	if err != nil {
		log.Error("email sender", "err", err)
		os.Exit(1)
	}

	// 非 prod 是合法的本地姿态，但必须醒目：DB 限流关闭、CORS 回落本地
	// 白名单。忘设 PLANET_ENV=prod 的生产部署靠这一行在 journalctl 里现形。
	if cfg.Env != "prod" {
		log.Warn("planet-api running with DEV posture: database-backed auth rate limits DISABLED, CORS falls back to localhost origins")
	}

	// Persisted auth throttles are a production invariant. Local development
	// with DEV_AUTH_CODES uses generous process-local buckets so repeated E2E
	// runs do not lock out the developer; strict tests keep production limits.
	persistentAuthLimits := cfg.Env == "prod"
	handler := app.New(pool, log, cfg.DevAuthCodes, cfg.CORSOrigins, mailer, app.AuthLimits{
		DatabaseRateLimits: &persistentAuthLimits,
	})

	// P0 主动服务调度器：显式开启才跑（默认关；本地/测试不会触发推送与邮件）。
	if os.Getenv("PLANET_SCHEDULER") == "1" {
		sched := app.NewScheduler(pool, log, mailer)
		go sched.Run(ctx)
		log.Info("scheduler enabled (PLANET_SCHEDULER=1): 1-minute tick for reminders/digest/alerts")
	}

	srv := &http.Server{
		Addr:              cfg.Bind,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		log.Info("planet-api listening", "bind", cfg.Bind, "env", cfg.Env)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Error("server", "err", err)
			stop()
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
	log.Info("planet-api stopped")
}
