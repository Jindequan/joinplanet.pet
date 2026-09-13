package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/joinplanet/planet-api/internal/app"
	"github.com/joinplanet/planet-api/internal/platform/clockx"
	"github.com/joinplanet/planet-api/internal/platform/db"
	"github.com/joinplanet/planet-api/internal/platform/email"
)

// cmdDigest：手动核验/补发某圈的每日摘要（P0 主动服务）。
// planet-cli digest --family <id> [--date YYYY-MM-DD] [--dry-run] --url <database-url>
func cmdDigest(args []string) {
	fs := flag.NewFlagSet("digest", flag.ExitOnError)
	url := fs.String("url", os.Getenv("DATABASE_URL"), "database url")
	family := fs.String("family", "", "family id (required)")
	date := fs.String("date", "", "digest date YYYY-MM-DD (default: family-local today)")
	dryRun := fs.Bool("dry-run", false, "print the email instead of sending")
	flags, _ := splitArgs(args)
	_ = fs.Parse(flags)
	requireURL(*url)
	if *family == "" {
		slog.Error("planet-cli", "err", "--family is required")
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	pool, err := db.NewPool(ctx, *url)
	exitOn(err)
	defer pool.Close()

	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	mailer, err := email.NewSender(log, os.Getenv("RESEND_API_KEY"), os.Getenv("PLANET_ENV"))
	exitOn(err)
	ops := app.NewProactiveOps(pool, log, mailer)
	now := clockx.New().Now()

	if *dryRun {
		_, subject, text, err := ops.Digest.ComposeEmailForFamily(ctx, *family, *date, now)
		exitOn(err)
		fmt.Println(subject)
		fmt.Println("---")
		fmt.Print(text)
		return
	}
	res, err := ops.Digest.SendDigest(ctx, *family, *date, now)
	exitOn(err)
	fmt.Printf("sent: %d\n", res.Sent)
	for _, f := range res.Failures {
		fmt.Printf("failed: %s: %s\n", f.To, f.Error)
	}
}

// cmdAlerts：手动核验某圈的异常预警（与 GET /api/v1/families/{id}/alerts 同一套规则）。
// planet-cli alerts --family <id> --url <database-url>
func cmdAlerts(args []string) {
	fs := flag.NewFlagSet("alerts", flag.ExitOnError)
	url := fs.String("url", os.Getenv("DATABASE_URL"), "database url")
	family := fs.String("family", "", "family id (required)")
	flags, _ := splitArgs(args)
	_ = fs.Parse(flags)
	requireURL(*url)
	if *family == "" {
		slog.Error("planet-cli", "err", "--family is required")
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	pool, err := db.NewPool(ctx, *url)
	exitOn(err)
	defer pool.Close()

	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	ops := app.NewProactiveOps(pool, log, &email.DevSender{Log: log})
	alerts, err := ops.Alerts.FamilyAlerts(ctx, *family, clockx.New().Now())
	exitOn(err)
	if len(alerts) == 0 {
		fmt.Println("alerts: none")
		return
	}
	out, err := json.MarshalIndent(alerts, "", "  ")
	exitOn(err)
	fmt.Println(string(out))
}
