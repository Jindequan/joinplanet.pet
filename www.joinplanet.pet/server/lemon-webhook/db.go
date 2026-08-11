package main

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// MembershipStatus mirrors the CHECK constraint in schema.sql.
const (
	statusPaid      = "paid"
	statusClaimed   = "claimed"
	statusRefunded  = "refunded"
	statusOverLimit = "over_limit"
)

// membershipClaim mirrors one row of membership_claims.
type membershipClaim struct {
	ID            int
	OrderID       string
	Email         string
	EmailHash     string
	Sku           string
	Plan          string
	Status        string
	PaidAt        *time.Time
	RefundedAt    *time.Time
	ClaimedUserID *string
	ClaimedAt     *time.Time
}

func newPool(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, err
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		return nil, err
	}
	return pool, nil
}

// countActiveMembers returns the number of paid or claimed memberships.
func countActiveMembers(ctx context.Context, q pgxQuerier) (int, error) {
	var n int
	err := q.QueryRow(ctx,
		`SELECT count(*) FROM membership_claims WHERE status IN ($1,$2)`,
		statusPaid, statusClaimed,
	).Scan(&n)
	return n, err
}

// findClaimByOrder loads a membership row by order id (or returns nil if absent).
func findClaimByOrder(ctx context.Context, q pgxQuerier, orderID string) (*membershipClaim, error) {
	var c membershipClaim
	err := q.QueryRow(ctx,
		`SELECT id, order_id, email, email_hash, sku, plan, status, paid_at, refunded_at, claimed_user_id, claimed_at
		 FROM membership_claims WHERE order_id = $1`, orderID,
	).Scan(&c.ID, &c.OrderID, &c.Email, &c.EmailHash, &c.Sku, &c.Status, &c.PaidAt, &c.RefundedAt, &c.ClaimedUserID, &c.ClaimedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// findActiveClaimByEmailHash returns a paid/claimed membership for the given email hash.
func findActiveClaimByEmailHash(ctx context.Context, q pgxQuerier, emailHash string) (*membershipClaim, error) {
	var c membershipClaim
	err := q.QueryRow(ctx,
		`SELECT id, order_id, email, email_hash, sku, plan, status, paid_at, refunded_at, claimed_user_id, claimed_at
		 FROM membership_claims
		 WHERE email_hash = $1 AND status IN ($2,$3)
		 LIMIT 1`, emailHash, statusPaid, statusClaimed,
	).Scan(&c.ID, &c.OrderID, &c.Email, &c.EmailHash, &c.Sku, &c.Plan, &c.Status, &c.PaidAt, &c.RefundedAt, &c.ClaimedUserID, &c.ClaimedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// insertPaidClaim creates a paid membership row. Returns statusOverLimit when at capacity.
//
// Concurrency safety: the count-then-insert sequence is guarded by a
// transaction-scoped advisory lock so that concurrent webhooks (e.g. Lemon
// retries, or two orders landing in the same instant) serialize. Without this
// lock, READ COMMITTED would let two transactions both read count=99 and both
// insert, overshooting the capacity. The advisory lock key is a stable hash of
// a fixed namespace string, so it is the same key across all instances and
// connections — this is what makes the cap safe across multiple backend
// processes, not just within one.
func insertPaidClaim(ctx context.Context, tx pgx.Tx, c membershipClaim, capacity int) (string, error) {
	// Transaction-scoped advisory lock. Key derived from a stable namespace;
	// pg_advisory_xact_lock takes a 64-bit int. hashtext() maps our constant
	// string into int4; we pass the same value in both halves to form int8.
	const lockKey = "planet_membership_cap"
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, lockKey); err != nil {
		return "", err
	}
	active, err := countActiveMembers(ctx, tx)
	if err != nil {
		return "", err
	}
	status := statusPaid
	if active >= capacity {
		status = statusOverLimit
	}
	var paidAt any
	if c.PaidAt != nil {
		paidAt = *c.PaidAt
	} else {
		paidAt = time.Now().UTC()
	}
	_, err = tx.Exec(ctx,
		`INSERT INTO membership_claims (order_id, email, email_hash, sku, plan, status, paid_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,now())`,
		c.OrderID, c.Email, c.EmailHash, c.Sku, c.Plan, status, paidAt,
	)
	return status, err
}

// markRefunded flips a membership to refunded (idempotent).
func markRefunded(ctx context.Context, q pgxQuerier, orderID string, refundedAt string) error {
	if refundedAt == "" {
		refundedAt = time.Now().UTC().Format(time.RFC3339)
	}
	_, err := q.Exec(ctx,
		`UPDATE membership_claims SET status = $1, refunded_at = $2, updated_at = now() WHERE order_id = $3`,
		statusRefunded, refundedAt, orderID,
	)
	return err
}

// claimMembership links an email-hash-matched membership to a user id.
func claimMembership(ctx context.Context, q pgxQuerier, claimID int, userID string) error {
	_, err := q.Exec(ctx,
		`UPDATE membership_claims
		 SET claimed_user_id = $1, claimed_at = now(), status = $2, updated_at = now()
		 WHERE id = $3 AND status IN ($4,$5)`,
		userID, statusClaimed, claimID, statusPaid, statusClaimed,
	)
	return err
}

// webhookEventSeen reports whether eventID was already recorded.
func webhookEventSeen(ctx context.Context, q pgxQuerier, eventID string) (bool, error) {
	var id int
	err := q.QueryRow(ctx, `SELECT id FROM payment_webhook_events WHERE event_id = $1`, eventID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}

// recordWebhookEvent inserts an event row (dedup guard) and returns whether it was new.
func recordWebhookEvent(ctx context.Context, q pgxQuerier, eventID, eventName string) (bool, error) {
	tag, err := q.Exec(ctx,
		`INSERT INTO payment_webhook_events (event_id, event_name) VALUES ($1,$2)
		 ON CONFLICT (event_id) DO NOTHING`,
		eventID, eventName,
	)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}

func markWebhookProcessed(ctx context.Context, q pgxQuerier, eventID string, lastError string) error {
	var errStr any
	if lastError != "" {
		errStr = lastError
	}
	_, err := q.Exec(ctx,
		`UPDATE payment_webhook_events SET processed = TRUE, processed_at = now(), last_error = $2 WHERE event_id = $1`,
		eventID, errStr,
	)
	return err
}

func insertPetIntake(ctx context.Context, q pgxQuerier, email, emailHash, want, orderID, source string) error {
	var oid any
	if orderID != "" {
		oid = orderID
	}
	_, err := q.Exec(ctx,
		`INSERT INTO pet_intake (email, email_hash, want, order_id, source, updated_at)
		 VALUES ($1,$2,$3,$4,$5,now())`,
		email, emailHash, want, oid, source,
	)
	return err
}

// insertEmailCapture is idempotent via the email_hash unique index.
func insertEmailCapture(ctx context.Context, q pgxQuerier, email, emailHash, source string) (bool, error) {
	tag, err := q.Exec(ctx,
		`INSERT INTO email_captures (email, email_hash, source) VALUES ($1,$2,$3)
		 ON CONFLICT (email_hash) DO NOTHING`,
		email, emailHash, source,
	)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}

// progressRow is the per-tier count returned by the progress endpoint.
type progressRow struct {
	Status string
	Sku    string
}

func listActiveClaims(ctx context.Context, q pgxQuerier) ([]progressRow, error) {
	rows, err := q.Query(ctx,
		`SELECT status, sku FROM membership_claims WHERE status IN ($1,$2)`,
		statusPaid, statusClaimed,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []progressRow
	for rows.Next() {
		var r progressRow
		if err := rows.Scan(&r.Status, &r.Sku); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// pgxQuerier is the subset of pgxpool.Pool / pgx.Tx used by the helpers above.
type pgxQuerier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}
