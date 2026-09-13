package db

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"

	"github.com/joinplanet/planet-api/internal/platform/httpx"
)

var ErrIdempotencyKeyReused = errors.New("idempotency key reused with a different request")

type IdempotencyClaim struct {
	Replay       bool
	ResourceType string
	ResourceID   string
	// ResponseBody contains the small, command-specific response fragment
	// needed to replay a result whose secret is intentionally not stored on the
	// resource itself (for example an invite code or share token).
	ResponseBody []byte
}

func RequestHash(parts ...string) string {
	h := sha256.New()
	for _, part := range parts {
		h.Write([]byte{0})
		h.Write([]byte(part))
	}
	return hex.EncodeToString(h.Sum(nil))
}

// ClaimIdempotency must run in the same transaction as the resource write.
// The primary-key conflict serializes concurrent retries; a different payload
// under the same key is rejected instead of silently returning another object.
func ClaimIdempotency(ctx context.Context, q Q, userID, scope, key, requestHash string) (IdempotencyClaim, error) {
	key = strings.TrimSpace(key)
	if key == "" {
		return IdempotencyClaim{}, nil
	}
	if len(key) < 8 || len(key) > 200 {
		return IdempotencyClaim{}, httpx.ErrValidation("Idempotency-Key must be 8-200 characters")
	}
	// Keep the bounded table healthy. The indexed, capped cleanup is part of
	// the same transaction and never removes a live key.
	if _, err := q.Exec(ctx, `
		WITH expired AS (
			SELECT id
			FROM idempotency_keys
			WHERE expires_at <= now()
			ORDER BY expires_at
			LIMIT 1000
		)
		DELETE FROM idempotency_keys k
		USING expired e
		WHERE k.id = e.id`); err != nil {
		return IdempotencyClaim{}, err
	}
	_, err := q.Exec(ctx, `
		INSERT INTO idempotency_keys
			(principal_user_id, scope_type, command_name, idempotency_key, request_hash, status, expires_at)
		VALUES ($1, 'global', $2, $3, $4, 'processing', now() + interval '24 hours')
		ON CONFLICT DO NOTHING`, userID, scope, key, requestHash)
	if err != nil {
		return IdempotencyClaim{}, err
	}
	var claim IdempotencyClaim
	var storedHash string
	err = q.QueryRow(ctx, `
		SELECT request_hash, COALESCE(resource_type, ''), COALESCE(resource_id::text, ''), COALESCE(response_body, '{}'::jsonb)
		FROM idempotency_keys
		WHERE principal_user_id = $1 AND scope_type = 'global' AND command_name = $2 AND idempotency_key = $3
		FOR UPDATE`, userID, scope, key).Scan(&storedHash, &claim.ResourceType, &claim.ResourceID, &claim.ResponseBody)
	if err != nil {
		return IdempotencyClaim{}, err
	}
	if storedHash != requestHash {
		return IdempotencyClaim{}, ErrIdempotencyKeyReused
	}
	claim.Replay = claim.ResourceID != ""
	return claim, nil
}

func BindIdempotency(ctx context.Context, q Q, userID, scope, key, resourceType, resourceID string) error {
	return bindIdempotency(ctx, q, userID, scope, key, resourceType, resourceID, nil)
}

// BindIdempotencyWithResponse binds a resource and a replayable response
// fragment in the same transaction. The response is deliberately scoped to
// the idempotency record; it is never copied to the resource or access logs.
func BindIdempotencyWithResponse(ctx context.Context, q Q, userID, scope, key, resourceType, resourceID string, responseBody []byte) error {
	return bindIdempotency(ctx, q, userID, scope, key, resourceType, resourceID, responseBody)
}

func bindIdempotency(ctx context.Context, q Q, userID, scope, key, resourceType, resourceID string, responseBody []byte) error {
	if strings.TrimSpace(key) == "" {
		return nil
	}
	var err error
	if responseBody == nil {
		_, err = q.Exec(ctx, `
		UPDATE idempotency_keys
		SET resource_type = $4, resource_id = $5, status = 'succeeded', completed_at = now()
		WHERE principal_user_id = $1 AND scope_type = 'global' AND command_name = $2 AND idempotency_key = $3`,
			userID, scope, key, resourceType, resourceID)
		return err
	}
	_, err = q.Exec(ctx, `
		UPDATE idempotency_keys
		SET resource_type = $4, resource_id = $5, response_body = $6::jsonb,
			status = 'succeeded', completed_at = now()
		WHERE principal_user_id = $1 AND scope_type = 'global' AND command_name = $2 AND idempotency_key = $3`,
		userID, scope, key, resourceType, resourceID, responseBody)
	return err
}
