// Package audit contains the one append-only write primitive shared by
// governance modules. Callers must invoke it on their caller-owned
// transaction so the audit row commits or rolls back with the mutation.
package audit

import (
	"context"
	"encoding/json"

	"github.com/joinplanet/planet-api/internal/platform/db"
)

func Record(ctx context.Context, q db.Q, actorUserID, action, resourceType, resourceID string, metadata map[string]any) error {
	if metadata == nil {
		metadata = map[string]any{}
	}
	payload, err := json.Marshal(metadata)
	if err != nil {
		return err
	}
	_, err = q.Exec(ctx, `
		INSERT INTO audit_records (actor_user_id, action, resource_type, resource_id, metadata)
		VALUES ($1, $2, $3, $4, $5::jsonb)`, actorUserID, action, resourceType, resourceID, payload)
	return err
}
