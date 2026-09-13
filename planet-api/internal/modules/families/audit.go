package families

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	platformaudit "github.com/joinplanet/planet-api/internal/platform/audit"
	"github.com/joinplanet/planet-api/internal/platform/db"
	"github.com/joinplanet/planet-api/internal/platform/httpx"
)

// AuditRecord is the user-visible, append-only history of Family governance.
// It deliberately stores metadata as a small structured payload instead of
// copying a second version of Family/Member/Pet/CarePlan state.
type AuditRecord struct {
	ID           string
	ActorUserID  string
	ActorName    string
	Action       string
	ResourceType string
	ResourceID   string
	OccurredAt   time.Time
	Metadata     map[string]any
}

func recordAudit(ctx context.Context, q db.Q, actorUserID, action, resourceType, resourceID string, metadata map[string]any) error {
	return platformaudit.Record(ctx, q, actorUserID, action, resourceType, resourceID, metadata)
}

func (r *Repo) ListAudit(ctx context.Context, q db.Q, familyID string, limit int) ([]AuditRecord, error) {
	if limit < 1 || limit > 100 {
		limit = 50
	}
	rows, err := q.Query(ctx, `
		SELECT a.id, COALESCE(a.actor_user_id::text, ''), COALESCE(u.display_name, '已删除用户'),
		       a.action, a.resource_type, COALESCE(a.resource_id::text, ''),
		       a.occurred_at, a.metadata
		FROM audit_records a
		LEFT JOIN users u ON u.id = a.actor_user_id
		WHERE (a.resource_type = 'family' AND a.resource_id = $1::uuid)
		   OR (a.resource_type IN ('pet', 'care_plan') AND (
				a.metadata->>'family_id' = $1::text OR
				(a.metadata ? 'family_ids' AND a.metadata->'family_ids' ? $1::text) OR
				a.metadata->>'from_family_id' = $1::text OR
				a.metadata->>'to_family_id' = $1::text
		   ))
		ORDER BY a.occurred_at DESC, a.id DESC
		LIMIT $2`, familyID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]AuditRecord, 0)
	for rows.Next() {
		var item AuditRecord
		var metadata []byte
		if err := rows.Scan(&item.ID, &item.ActorUserID, &item.ActorName, &item.Action,
			&item.ResourceType, &item.ResourceID, &item.OccurredAt, &metadata); err != nil {
			return nil, err
		}
		if len(metadata) == 0 {
			item.Metadata = map[string]any{}
		} else if err := json.Unmarshal(metadata, &item.Metadata); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (s *Service) ListAudit(ctx context.Context, familyID, userID string, limit int) ([]AuditRecord, error) {
	if _, err := s.requireMember(ctx, familyID, userID, false); err != nil {
		return nil, err
	}
	items, err := s.Repo.ListAudit(ctx, s.Pool, familyID, limit)
	if err != nil {
		if errorsIsNoTable(err) {
			return nil, httpx.NewAppError(503, "AUDIT_UNAVAILABLE", "audit history is not ready")
		}
		return nil, err
	}
	return items, nil
}

// Keep the read path's error mapping local; a rolling deploy may briefly run
// an older database before migration 0020 is applied.
func errorsIsNoTable(err error) bool {
	return err != nil && strings.Contains(err.Error(), `relation "audit_records" does not exist`)
}
