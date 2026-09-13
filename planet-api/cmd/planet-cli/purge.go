package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/joinplanet/planet-api/internal/platform/db"
)

// cmdPurgeDelete cleans up data beyond the recovery/retention window.
// Two layers:
//   - operational tables that only ever accumulate: sessions, auth_challenges,
//     auth_rate_limits, job_runs, idempotency_keys (retention-days; auth_rate_limits
//     windows only need 2 days because the largest throttle window is 24h)
//   - soft-deleted families past the 30-day restore window are hard-deleted
//     after family-scoped collaboration rows are purged; care history is
//     retained by archiving and detaching old Family-owned plans
//
// systemd timer runs every 6h (deploy/planet-cli-purge.timer.example).
// audit_records is intentionally untouched: it is append-only by trigger;
// a retention policy for it is a product decision, not a housekeeping one.
func cmdPurgeDeleted(args []string) {
	fs := flag.NewFlagSet("purge-deleted", flag.ExitOnError)
	url := fs.String("url", os.Getenv("DATABASE_URL"), "database url")
	days := fs.Int("retention-days", 30, "soft-delete recovery window")
	dryRun := fs.Bool("dry-run", false, "只统计不删除")
	flags, _ := splitArgs(args)
	_ = fs.Parse(flags)
	target := requireURL(*url)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	pool, err := db.NewPool(ctx, target)
	exitOn(err)
	defer pool.Close()

	// (label, 判定过期的 SQL, 清理 SQL)。过期判定统一走业务时间戳而不是
	// updated_at： revoked/expired/completed 是行生命周期的权威信号。
	type purgeTable struct {
		label string
		count string
		del   string
	}
	window := "now() - ($1 || ' days')::interval"
	tables := []purgeTable{
		{"sessions", `
			SELECT count(*) FROM sessions
			WHERE (revoked_at IS NOT NULL AND revoked_at < ` + window + `)
			   OR expires_at < ` + window, `
			DELETE FROM sessions
			WHERE (revoked_at IS NOT NULL AND revoked_at < ` + window + `)
			   OR expires_at < ` + window},
		{"auth_challenges", `
			SELECT count(*) FROM auth_challenges
			WHERE expires_at < ` + window, `
			DELETE FROM auth_challenges
			WHERE expires_at < ` + window},
		{"auth_rate_limits", `
			SELECT count(*) FROM auth_rate_limits
			WHERE window_start < now() - interval '2 days'`, `
			DELETE FROM auth_rate_limits
			WHERE window_start < now() - interval '2 days'`},
		{"job_runs", `
			SELECT count(*) FROM job_runs
			WHERE (completed_at IS NOT NULL AND completed_at < ` + window + `)
			   OR (status='failed' AND available_at='infinity')
			   OR (status='running' AND locked_until < ` + window + `)`, `
			DELETE FROM job_runs
			WHERE (completed_at IS NOT NULL AND completed_at < ` + window + `)
			   OR (status='failed' AND available_at='infinity')
			   OR (status='running' AND locked_until < ` + window + `)`},
		{"idempotency_keys", `
			SELECT count(*) FROM idempotency_keys
			WHERE expires_at < now() - interval '1 day'`, `
			DELETE FROM idempotency_keys
			WHERE expires_at < now() - interval '1 day'`},
	}
	for _, t := range tables {
		var n int
		exitOn(pool.QueryRow(ctx, t.count, fmt.Sprintf("%d", *days)).Scan(&n))
		if *dryRun {
			fmt.Printf("purge-deleted (dry-run): %s: %d row(s) eligible\n", t.label, n)
			continue
		}
		tag, err := pool.Exec(ctx, t.del, fmt.Sprintf("%d", *days))
		exitOn(err)
		fmt.Printf("purge-deleted: %s: removed %d row(s)\n", t.label, tag.RowsAffected())
	}

	var n int
	exitOn(pool.QueryRow(ctx, `
		SELECT count(*) FROM families
		WHERE deleted_at IS NOT NULL AND deleted_at < now() - ($1 || ' days')::interval`,
		fmt.Sprintf("%d", *days)).Scan(&n))
	if *dryRun {
		fmt.Printf("purge-deleted (dry-run): %d family(s) eligible\n", n)
		return
	}
	var purged int64
	err = db.InTx(ctx, pool, func(tx pgx.Tx) error {
		arg := fmt.Sprintf("%d", *days)
		familyFilter := `family_id IN (
			SELECT id FROM families
			WHERE deleted_at IS NOT NULL AND deleted_at < now() - ($1 || ' days')::interval
		)`
		// Request events must go before requests; a request chain may point at
		// another request, and a handoff batch may still be referenced by a
		// request from a related scope.
		if _, err := tx.Exec(ctx, `
			DELETE FROM care_request_events
			WHERE request_id IN (SELECT id FROM care_requests WHERE `+familyFilter+`)`, arg); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			UPDATE care_requests
			SET supersedes_request_id = NULL
			WHERE supersedes_request_id IN (SELECT id FROM care_requests WHERE `+familyFilter+`)`, arg); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			UPDATE care_requests
			SET batch_id = NULL
			WHERE batch_id IN (SELECT id FROM care_handoff_batches WHERE `+familyFilter+`)`, arg); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM care_requests WHERE `+familyFilter, arg); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM care_handoff_batches WHERE `+familyFilter, arg); err != nil {
			return err
		}
		// care_plans are referenced by occurrences and events with RESTRICT.
		// Keep those facts, but prevent an expired Family from reactivating or
		// exposing an active plan after its Family row is physically removed.
		if _, err := tx.Exec(ctx, `
			UPDATE care_plans
			SET family_id = NULL, status = 'archived', updated_at = now()
			WHERE `+familyFilter, arg); err != nil {
			return err
		}
		// pet_events.family_id already uses SET NULL; other family edges use
		// CASCADE and can be removed with the Family.
		tag, err := tx.Exec(ctx, `
			DELETE FROM families
			WHERE deleted_at IS NOT NULL AND deleted_at < now() - ($1 || ' days')::interval`, arg)
		if err != nil {
			return err
		}
		purged = tag.RowsAffected()
		return nil
	})
	exitOn(err)
	fmt.Printf("purge-deleted: removed %d family(s) beyond the %d-day window\n",
		purged, *days)
}
