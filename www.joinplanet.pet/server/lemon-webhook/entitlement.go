package main

// entitlement.go — rights layer: founding-member wildcard grants + checks.
// Contract: API-CONTRACT.md 权益层（内部）. Grants are idempotent via the
// UNIQUE (user_id, feature_key, source) constraint.

import "context"

// canEntitle reports whether userID holds an unexpired grant for key,
// honouring the '*' wildcard.
func (a *app) canEntitle(ctx context.Context, userID int64, key string) bool {
	var one int
	err := a.pool.QueryRow(ctx,
		`SELECT 1 FROM entitlements
		  WHERE user_id = $1 AND feature_key IN ($2,'*')
		    AND (expires_at IS NULL OR expires_at > now())
		  LIMIT 1`, userID, key).Scan(&one)
	return err == nil
}

// grantEntitlement inserts a grant for one user; conflicts are ignored.
func grantEntitlement(ctx context.Context, q pgxQuerier, userID int64, featureKey, source, sourceRef string) error {
	var ref any
	if sourceRef != "" {
		ref = sourceRef
	}
	_, err := q.Exec(ctx,
		`INSERT INTO entitlements (user_id, feature_key, source, source_ref)
		 VALUES ($1,$2,$3,$4)
		 ON CONFLICT (user_id, feature_key, source) DO NOTHING`,
		userID, featureKey, source, ref)
	return err
}

// grantFoundingByEmailHash grants '*' to the user matching email_hash, if any
// (INSERT ... SELECT skips silently when the user does not exist yet). Used
// right after a paid webhook lands; /auth/verify replays the grant at signup.
func grantFoundingByEmailHash(ctx context.Context, q pgxQuerier, emailHash, sourceRef string) error {
	var ref any
	if sourceRef != "" {
		ref = sourceRef
	}
	_, err := q.Exec(ctx,
		`INSERT INTO entitlements (user_id, feature_key, source, source_ref)
		 SELECT u.id, '*', 'founding', $1 FROM users u WHERE u.email_hash = $2
		 ON CONFLICT (user_id, feature_key, source) DO NOTHING`,
		ref, emailHash)
	return err
}

// grantFoundingIfClaimed grants '*' after signup when this email hash has a
// paid or claimed membership row.
func (a *app) grantFoundingIfClaimed(ctx context.Context, userID int64, emailHash string) {
	claim, err := findActiveClaimByEmailHash(ctx, a.pool, emailHash)
	if err != nil || claim == nil {
		return
	}
	_ = grantEntitlement(ctx, a.pool, userID, "*", "founding", claim.OrderID)
}
