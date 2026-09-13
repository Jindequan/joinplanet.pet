package carecoord

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/joinplanet/planet-api/internal/platform/db"
)

type Repo struct{ Pool *pgxpool.Pool }

type Request struct {
	ID                          string     `json:"id"`
	FamilyID                    string     `json:"family_id"`
	FamilyTimezone              string     `json:"family_timezone"`
	PetID                       string     `json:"pet_id"`
	OccurrenceID                string     `json:"occurrence_id"`
	CarePlanID                  string     `json:"care_plan_id"`
	FromUserID                  string     `json:"from_user_id"`
	FromUserName                string     `json:"from_user_name"`
	TargetUserID                string     `json:"target_user_id"`
	TargetUserName              string     `json:"target_user_name"`
	NextRequestID               *string    `json:"next_request_id,omitempty"`
	NextTargetUserID            *string    `json:"next_target_user_id,omitempty"`
	NextTargetUserName          *string    `json:"next_target_user_name,omitempty"`
	State                       string     `json:"state"`
	Message                     string     `json:"message"`
	SupersedesRequest           *string    `json:"supersedes_request_id,omitempty"`
	BatchID                     *string    `json:"batch_id,omitempty"`
	SeenAt                      *time.Time `json:"seen_at,omitempty"`
	RespondedAt                 *time.Time `json:"responded_at,omitempty"`
	ResponseNote                string     `json:"response_note,omitempty"`
	PetName                     string     `json:"pet_name"`
	OccurrenceTitle             string     `json:"occurrence_title"`
	OccurrenceType              string     `json:"occurrence_type"`
	OccurrenceTime              *time.Time `json:"-"`
	OccurrenceStatus            string     `json:"occurrence_status"`
	OccurrenceCompletedByUserID *string    `json:"occurrence_completed_by_user_id,omitempty"`
	OccurrenceCompletedByName   *string    `json:"occurrence_completed_by_name,omitempty"`
	OccurrenceCompletedAt       *time.Time `json:"occurrence_completed_at,omitempty"`
	DueAt                       *time.Time `json:"due_at,omitempty"`
	DueDate                     *time.Time `json:"due_date,omitempty"`
	CreatedAt                   time.Time  `json:"created_at"`
	UpdatedAt                   time.Time  `json:"updated_at"`
}

type Occurrence struct {
	ID               string
	FamilyID         string
	PetID            string
	Title            string
	Type             string
	Status           string
	AssignedToUserID *string
	DueAt            *time.Time
	DueDate          *time.Time
}

type EscalationCandidate struct {
	OccurrenceID string
	PetID        string
	FamilyID     string
	FromUserID   string
	TargetUserID string
	PetName      string
	Title        string
	DueAt        *time.Time
}

type rowScanner interface{ Scan(dest ...any) error }

const requestCols = "r.id::text, r.family_id::text, r.pet_id::text, r.occurrence_id::text, co.care_plan_id::text, " +
	"f.timezone, " +
	"r.from_user_id::text, COALESCE(from_user.display_name, from_user.email), " +
	"r.target_user_id::text, COALESCE(target_user.display_name, target_user.email), " +
	"r.state, r.message, r.supersedes_request_id::text, continuation.id::text, continuation.target_user_id::text, " +
	"COALESCE(continuation_target.display_name, continuation_target.email), r.batch_id::text, r.seen_at, r.responded_at, " +
	"r.response_note, p.name, COALESCE(NULLIF(co.title_snapshot, ''), cp.title), " +
	"COALESCE(NULLIF(co.type_snapshot, ''), cp.type), co.local_time, co.status, co.due_at, co.due_date, " +
	"co.completed_by_user_id::text, completed_user.display_name, co.completed_at, " +
	"r.created_at, r.updated_at"

const requestFrom = " FROM care_requests r " +
	"JOIN families f ON f.id = r.family_id AND f.deleted_at IS NULL " +
	"JOIN care_occurrences co ON co.id = r.occurrence_id AND co.pet_id = r.pet_id " +
	"JOIN care_plans cp ON cp.id = co.care_plan_id AND cp.deleted_at IS NULL AND cp.family_id = r.family_id " +
	"JOIN pets p ON p.id = r.pet_id " +
	"LEFT JOIN users completed_user ON completed_user.id = co.completed_by_user_id " +
	"JOIN users from_user ON from_user.id = r.from_user_id " +
	"JOIN users target_user ON target_user.id = r.target_user_id " +
	"LEFT JOIN LATERAL (" +
	"SELECT nr.id, nr.target_user_id FROM care_requests nr " +
	"WHERE nr.supersedes_request_id = r.id AND nr.deleted_at IS NULL " +
	"ORDER BY nr.created_at DESC, nr.id DESC LIMIT 1" +
	") continuation ON true " +
	"LEFT JOIN users continuation_target ON continuation_target.id = continuation.target_user_id "

func scanRequest(row rowScanner) (Request, error) {
	var r Request
	err := row.Scan(
		&r.ID, &r.FamilyID, &r.PetID, &r.OccurrenceID, &r.CarePlanID, &r.FamilyTimezone,
		&r.FromUserID, &r.FromUserName, &r.TargetUserID, &r.TargetUserName,
		&r.State, &r.Message, &r.SupersedesRequest, &r.NextRequestID, &r.NextTargetUserID, &r.NextTargetUserName, &r.BatchID,
		&r.SeenAt, &r.RespondedAt, &r.ResponseNote,
		&r.PetName, &r.OccurrenceTitle, &r.OccurrenceType, &r.OccurrenceTime, &r.OccurrenceStatus,
		&r.DueAt, &r.DueDate,
		&r.OccurrenceCompletedByUserID, &r.OccurrenceCompletedByName, &r.OccurrenceCompletedAt,
		&r.CreatedAt, &r.UpdatedAt,
	)
	return r, err
}

func (r *Repo) Get(ctx context.Context, q db.Q, id string) (Request, error) {
	return scanRequest(q.QueryRow(ctx, "SELECT "+requestCols+requestFrom+" WHERE r.id=$1 AND r.deleted_at IS NULL", id))
}

func (r *Repo) LatestForOccurrence(ctx context.Context, q db.Q, occurrenceID string) (Request, error) {
	return scanRequest(q.QueryRow(ctx, "SELECT "+requestCols+requestFrom+" WHERE r.occurrence_id=$1 AND r.deleted_at IS NULL ORDER BY r.created_at DESC, r.id DESC LIMIT 1", occurrenceID))
}

// ListChain returns every request attached to one occurrence in creation order.
// A request chain is deliberately a read model over the existing request rows;
// it never creates a second task or occurrence.
func (r *Repo) ListChain(ctx context.Context, q db.Q, occurrenceID string) ([]Request, error) {
	rows, err := q.Query(ctx, "SELECT "+requestCols+requestFrom+" WHERE r.occurrence_id=$1 AND r.deleted_at IS NULL ORDER BY r.created_at ASC, r.id ASC", occurrenceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Request
	for rows.Next() {
		item, err := scanRequest(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (r *Repo) UserLabel(ctx context.Context, q db.Q, userID string) (string, error) {
	var label string
	err := q.QueryRow(ctx, `SELECT COALESCE(NULLIF(display_name,''), email) FROM users WHERE id=$1`, userID).Scan(&label)
	return label, err
}

func (r *Repo) IsActiveFamilyMember(ctx context.Context, q db.Q, familyID, userID string) (bool, error) {
	var ok bool
	err := q.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM family_memberships
			WHERE family_id=$1 AND user_id=$2 AND status='active'
			  AND ended_at IS NULL AND deleted_at IS NULL
		)`, familyID, userID).Scan(&ok)
	return ok, err
}

// IsRequestParticipant authorizes read-only access for anyone who has already
// appeared in the occurrence's request chain. A prior participant may receive
// a handoff receipt for a newer request whose from/target pair no longer
// includes them, but must never gain action permissions from this check.
func (r *Repo) IsRequestParticipant(ctx context.Context, q db.Q, occurrenceID, userID string) (bool, error) {
	var ok bool
	err := q.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1
			FROM care_requests
			WHERE occurrence_id=$1
			  AND deleted_at IS NULL
			  AND (from_user_id=$2 OR target_user_id=$2)
		)`, occurrenceID, userID).Scan(&ok)
	return ok, err
}

func (r *Repo) GetForUpdate(ctx context.Context, q db.Q, id string) (Request, error) {
	return scanRequest(q.QueryRow(ctx, "SELECT "+requestCols+requestFrom+" WHERE r.id=$1 AND r.deleted_at IS NULL FOR UPDATE OF r", id))
}

func (r *Repo) ListOpenForOccurrenceForUpdate(ctx context.Context, q db.Q, occurrenceID string) ([]Request, error) {
	rows, err := q.Query(ctx, "SELECT "+requestCols+requestFrom+" WHERE r.occurrence_id=$1 AND r.state IN ('sent','seen') AND r.deleted_at IS NULL ORDER BY r.created_at FOR UPDATE OF r", occurrenceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Request
	for rows.Next() {
		item, err := scanRequest(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (r *Repo) ListOpenForFamilyMemberForUpdate(ctx context.Context, q db.Q, familyID, memberID string) ([]Request, error) {
	rows, err := q.Query(ctx, "SELECT "+requestCols+requestFrom+" WHERE r.family_id=$1 AND (r.from_user_id=$2 OR r.target_user_id=$2) AND r.state IN ('sent','seen') AND r.deleted_at IS NULL AND co.status IN ('pending','missed') ORDER BY r.created_at FOR UPDATE OF r", familyID, memberID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Request
	for rows.Next() {
		item, err := scanRequest(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (r *Repo) ListInbox(ctx context.Context, q db.Q, userID string) ([]Request, error) {
	rows, err := q.Query(ctx, "SELECT "+requestCols+requestFrom+" JOIN family_memberships target_membership ON target_membership.family_id=r.family_id AND target_membership.user_id=r.target_user_id AND target_membership.status='active' AND target_membership.ended_at IS NULL AND target_membership.deleted_at IS NULL AND target_membership.role IN ('owner', 'caregiver') WHERE r.target_user_id=$1 AND r.state IN ('sent','seen') AND co.status IN ('pending','missed') AND r.deleted_at IS NULL ORDER BY co.due_at NULLS LAST,r.created_at DESC", userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Request{}
	for rows.Next() {
		item, err := scanRequest(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

// ListSent returns the latest request the user initiated for each occurrence.
// A continuation remains attached to that row through requestFrom, so the
// sender can see who currently has the responsibility without receiving one
// duplicate card for every hop in the chain.
func (r *Repo) ListSent(ctx context.Context, q db.Q, userID string) ([]Request, error) {
	rows, err := q.Query(ctx, `
		SELECT `+requestCols+requestFrom+`
		JOIN family_memberships from_membership
		  ON from_membership.family_id=r.family_id
		 AND from_membership.user_id=r.from_user_id
		 AND from_membership.status='active'
		 AND from_membership.ended_at IS NULL
		 AND from_membership.deleted_at IS NULL
		WHERE r.from_user_id=$1 AND r.deleted_at IS NULL
		ORDER BY r.updated_at DESC, r.created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Request{}
	seenOccurrences := map[string]struct{}{}
	for rows.Next() {
		item, err := scanRequest(rows)
		if err != nil {
			return nil, err
		}
		if _, exists := seenOccurrences[item.OccurrenceID]; exists {
			continue
		}
		seenOccurrences[item.OccurrenceID] = struct{}{}
		out = append(out, item)
	}
	return out, rows.Err()
}

// RequestParticipants returns every member who has appeared in a request
// chain for an occurrence. Handoff feedback must reach the people already
// involved, not only the next target holding the action card.
func (r *Repo) RequestParticipants(ctx context.Context, q db.Q, occurrenceID string) ([]string, error) {
	rows, err := q.Query(ctx, `
		WITH chain AS (
			SELECT from_user_id AS participant_id, family_id
			FROM care_requests
			WHERE occurrence_id=$1 AND deleted_at IS NULL
			UNION
			SELECT target_user_id AS participant_id, family_id
			FROM care_requests
			WHERE occurrence_id=$1 AND deleted_at IS NULL
		)
		SELECT DISTINCT chain.participant_id::text
		FROM chain
		JOIN users u ON u.id=chain.participant_id
		  AND u.status='active' AND u.deleted_at IS NULL
		JOIN family_memberships fm ON fm.family_id=chain.family_id
		  AND fm.user_id=chain.participant_id
		  AND fm.status='active' AND fm.ended_at IS NULL AND fm.deleted_at IS NULL
		ORDER BY participant_id::text`, occurrenceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (r *Repo) GetOccurrenceForUpdate(ctx context.Context, q db.Q, id, familyID string) (Occurrence, error) {
	var o Occurrence
	err := q.QueryRow(ctx, "SELECT co.id::text,$2::text,co.pet_id::text,COALESCE(NULLIF(co.title_snapshot,''),cp.title),COALESCE(NULLIF(co.type_snapshot,''),cp.type),co.status,co.assigned_to_user_id::text,co.due_at,co.due_date FROM care_occurrences co JOIN care_plans cp ON cp.id=co.care_plan_id JOIN pets p ON p.id=co.pet_id WHERE co.id=$1 AND co.deleted_at IS NULL AND cp.deleted_at IS NULL AND cp.family_id=$2::uuid AND p.deleted_at IS NULL FOR UPDATE OF co", id, familyID).Scan(
		&o.ID, &o.FamilyID, &o.PetID, &o.Title, &o.Type, &o.Status, &o.AssignedToUserID, &o.DueAt, &o.DueDate,
	)
	return o, err
}

func (r *Repo) FamilyHasPetAndMembers(ctx context.Context, q db.Q, familyID, petID, fromUserID, targetUserID string) (bool, error) {
	var ok bool
	err := q.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM family_pet_links fp JOIN family_memberships fm ON fm.family_id=fp.family_id AND fm.user_id=$3 AND fm.status='active' AND fm.ended_at IS NULL AND fm.deleted_at IS NULL AND fm.role IN ('owner', 'caregiver') JOIN family_memberships tm ON tm.family_id=fp.family_id AND tm.user_id=$4 AND tm.status='active' AND tm.ended_at IS NULL AND tm.deleted_at IS NULL AND tm.role IN ('owner', 'caregiver') WHERE fp.family_id=$1 AND fp.pet_id=$2 AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL)", familyID, petID, fromUserID, targetUserID).Scan(&ok)
	return ok, err
}

// PreviouslyDeclinedTarget prevents a responsibility chain from cycling back
// to a member who already declined or timed out on this same Occurrence.
func (r *Repo) PreviouslyDeclinedTarget(ctx context.Context, q db.Q, occurrenceID, userID string) (bool, error) {
	var blocked bool
	err := q.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM care_requests WHERE occurrence_id=$1 AND target_user_id=$2 AND state IN ('declined','expired') AND deleted_at IS NULL)", occurrenceID, userID).Scan(&blocked)
	return blocked, err
}

func (r *Repo) OpenForOccurrence(ctx context.Context, q db.Q, occurrenceID string) (bool, error) {
	var ok bool
	err := q.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM care_requests r JOIN care_occurrences co ON co.id=r.occurrence_id WHERE r.occurrence_id=$1 AND r.state IN ('sent','seen') AND co.status IN ('pending','missed') AND r.deleted_at IS NULL)", occurrenceID).Scan(&ok)
	return ok, err
}

func (r *Repo) OpenForTarget(ctx context.Context, q db.Q, occurrenceID, userID string) (bool, error) {
	var ok bool
	err := q.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM care_requests r JOIN care_occurrences co ON co.id=r.occurrence_id WHERE r.occurrence_id=$1 AND r.target_user_id=$2 AND r.state IN ('sent','seen') AND co.status IN ('pending','missed') AND r.deleted_at IS NULL)", occurrenceID, userID).Scan(&ok)
	return ok, err
}

func (r *Repo) AcceptedForOther(ctx context.Context, q db.Q, occurrenceID, userID string) (bool, error) {
	var ok bool
	err := q.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM care_requests WHERE occurrence_id=$1 AND state='accepted' AND target_user_id<>$2 AND deleted_at IS NULL)", occurrenceID, userID).Scan(&ok)
	return ok, err
}

// AcceptedForTargetForUpdate returns the current responsibility record for a
// caregiver. Callers hold the occurrence lock first, so this lookup and the
// transition to delegated are serialized with acceptance and completion.
func (r *Repo) AcceptedForTargetForUpdate(ctx context.Context, q db.Q, occurrenceID, userID string) (Request, error) {
	var requestID string
	err := q.QueryRow(ctx, "SELECT id::text FROM care_requests WHERE occurrence_id=$1 AND target_user_id=$2 AND state='accepted' AND deleted_at IS NULL ORDER BY responded_at DESC NULLS LAST, created_at DESC, id DESC LIMIT 1 FOR UPDATE", occurrenceID, userID).Scan(&requestID)
	if err != nil {
		return Request{}, err
	}
	return r.GetForUpdate(ctx, q, requestID)
}

func (r *Repo) DueForExpiry(ctx context.Context, q db.Q, familyID string, now time.Time) ([]string, error) {
	rows, err := q.Query(ctx, `
		SELECT r.id::text
		FROM care_requests r
		JOIN care_occurrences co ON co.id=r.occurrence_id AND co.pet_id=r.pet_id
		JOIN care_plans cp ON cp.id=co.care_plan_id AND cp.deleted_at IS NULL AND cp.family_id=r.family_id
		WHERE r.family_id=$1
		  AND r.state IN ('sent','seen')
		  AND r.deleted_at IS NULL
		  AND co.status IN ('pending','missed')
		  AND co.due_at IS NOT NULL
		  AND co.due_at <= $2::timestamptz
		  AND co.deleted_at IS NULL
		ORDER BY co.due_at, r.created_at
		FOR UPDATE OF r SKIP LOCKED`, familyID, now.UTC())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// ListEscalationCandidates picks the earliest configured helper that has not
// already declined/expired a request for this occurrence. The 30-minute
// window keeps auto-escalation useful without creating a second task source.
func (r *Repo) ListEscalationCandidates(ctx context.Context, q db.Q, familyID string, now time.Time) ([]EscalationCandidate, error) {
	rows, err := q.Query(ctx, `
		SELECT DISTINCT ON (co.id)
		       co.id::text, co.pet_id::text, $1::text, co.assigned_to_user_id::text,
		       helper.user_id::text, p.name,
		       COALESCE(NULLIF(co.title_snapshot,''), cp.title), co.due_at
		FROM care_occurrences co
		JOIN care_plans cp ON cp.id=co.care_plan_id AND cp.deleted_at IS NULL
		JOIN pets p ON p.id=co.pet_id AND p.deleted_at IS NULL
		JOIN family_pet_links fp ON fp.family_id=$1 AND fp.pet_id=co.pet_id
		  AND fp.unlinked_at IS NULL AND fp.deleted_at IS NULL
		JOIN care_plan_assignments helper ON helper.care_plan_id=co.care_plan_id
		  AND helper.role='helper' AND helper.deleted_at IS NULL
		JOIN family_memberships fm ON fm.family_id=$1 AND fm.user_id=helper.user_id
		  AND fm.status='active' AND fm.ended_at IS NULL AND fm.deleted_at IS NULL
		  AND fm.role IN ('owner', 'caregiver')
		JOIN users helper_user ON helper_user.id=helper.user_id
		  AND helper_user.status='active' AND helper_user.deleted_at IS NULL
		WHERE cp.family_id=$1::uuid
		  AND co.assigned_to_user_id IS NOT NULL
		  AND co.status IN ('pending','missed')
		  AND co.due_at IS NOT NULL
		  AND co.due_at > $2::timestamptz
		  AND co.due_at <= ($2::timestamptz + interval '30 minutes')
		  AND co.deleted_at IS NULL
		  AND helper.user_id <> co.assigned_to_user_id
		  AND NOT EXISTS (
				SELECT 1 FROM care_requests open_request
				WHERE open_request.occurrence_id=co.id
				  AND open_request.state IN ('sent','seen')
				  AND open_request.deleted_at IS NULL
		  )
		  AND NOT EXISTS (
				SELECT 1 FROM care_requests previous_request
				WHERE previous_request.occurrence_id=co.id
				  AND previous_request.target_user_id=helper.user_id
				  AND previous_request.deleted_at IS NULL
		  )
		ORDER BY co.id, helper.created_at, helper.user_id`, familyID, now.UTC())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []EscalationCandidate{}
	for rows.Next() {
		var candidate EscalationCandidate
		if err := rows.Scan(&candidate.OccurrenceID, &candidate.PetID, &candidate.FamilyID, &candidate.FromUserID, &candidate.TargetUserID, &candidate.PetName, &candidate.Title, &candidate.DueAt); err != nil {
			return nil, err
		}
		out = append(out, candidate)
	}
	return out, rows.Err()
}

func (r *Repo) Insert(ctx context.Context, q db.Q, req Request, supersedes *string) (Request, error) {
	return r.InsertWithBatch(ctx, q, req, supersedes, "")
}

func (r *Repo) InsertWithBatch(ctx context.Context, q db.Q, req Request, supersedes *string, batchID string) (Request, error) {
	var id string
	err := q.QueryRow(ctx, "INSERT INTO care_requests(family_id,pet_id,occurrence_id,from_user_id,target_user_id,state,message,supersedes_request_id,batch_id) VALUES($1,$2,$3,$4,$5,'sent',$6,$7,NULLIF($8,'')::uuid) RETURNING id::text", req.FamilyID, req.PetID, req.OccurrenceID, req.FromUserID, req.TargetUserID, req.Message, supersedes, batchID).Scan(&id)
	if err != nil {
		return Request{}, err
	}
	return r.Get(ctx, q, id)
}

type Batch struct {
	ID             string
	FamilyID       string
	FamilyTimezone string
	FromUserID     string
	FromUserName   string
	TargetUserID   string
	TargetUserName string
	Message        string
	StartsAt       *time.Time
	EndsAt         *time.Time
	CreatedAt      time.Time
}

func (r *Repo) CreateBatch(ctx context.Context, q db.Q, batch Batch) (Batch, error) {
	var id string
	err := q.QueryRow(ctx, `
		INSERT INTO care_handoff_batches(family_id,from_user_id,target_user_id,message,starts_at,ends_at)
		VALUES($1,$2,$3,$4,$5,$6)
		RETURNING id::text,created_at`, batch.FamilyID, batch.FromUserID, batch.TargetUserID, batch.Message, batch.StartsAt, batch.EndsAt).Scan(&id, &batch.CreatedAt)
	if err != nil {
		return Batch{}, err
	}
	batch.ID = id
	return batch, nil
}

func (r *Repo) GetBatch(ctx context.Context, q db.Q, id string) (Batch, error) {
	var batch Batch
	err := q.QueryRow(ctx, `
		SELECT b.id::text,b.family_id::text,f.timezone,b.from_user_id::text,
		       COALESCE(from_user.display_name,from_user.email),
		       b.target_user_id::text,
		       COALESCE(target_user.display_name,target_user.email),
		       b.message,b.starts_at,b.ends_at,b.created_at
		FROM care_handoff_batches b
		JOIN families f ON f.id=b.family_id AND f.deleted_at IS NULL
		JOIN users from_user ON from_user.id=b.from_user_id
		JOIN users target_user ON target_user.id=b.target_user_id
		WHERE b.id=$1 AND b.deleted_at IS NULL`, id).Scan(
		&batch.ID, &batch.FamilyID, &batch.FamilyTimezone, &batch.FromUserID, &batch.FromUserName,
		&batch.TargetUserID, &batch.TargetUserName, &batch.Message,
		&batch.StartsAt, &batch.EndsAt, &batch.CreatedAt,
	)
	return batch, err
}

func (r *Repo) GetBatchForUpdate(ctx context.Context, q db.Q, id string) (Batch, error) {
	var batch Batch
	err := q.QueryRow(ctx, `
		SELECT b.id::text,b.family_id::text,f.timezone,b.from_user_id::text,
		       COALESCE(from_user.display_name,from_user.email),
		       b.target_user_id::text,
		       COALESCE(target_user.display_name,target_user.email),
		       b.message,b.starts_at,b.ends_at,b.created_at
		FROM care_handoff_batches b
		JOIN families f ON f.id=b.family_id AND f.deleted_at IS NULL
		JOIN users from_user ON from_user.id=b.from_user_id
		JOIN users target_user ON target_user.id=b.target_user_id
		WHERE b.id=$1 AND b.deleted_at IS NULL
		FOR UPDATE OF b`, id).Scan(
		&batch.ID, &batch.FamilyID, &batch.FamilyTimezone, &batch.FromUserID, &batch.FromUserName,
		&batch.TargetUserID, &batch.TargetUserName, &batch.Message,
		&batch.StartsAt, &batch.EndsAt, &batch.CreatedAt,
	)
	return batch, err
}

func (r *Repo) ListBatchRequests(ctx context.Context, q db.Q, batchID string) ([]Request, error) {
	rows, err := q.Query(ctx, "SELECT "+requestCols+requestFrom+" WHERE r.batch_id=$1 AND r.deleted_at IS NULL ORDER BY r.created_at ASC, r.id ASC", batchID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Request
	for rows.Next() {
		item, err := scanRequest(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (r *Repo) ListBatchIDsForTarget(ctx context.Context, q db.Q, userID string) ([]string, error) {
	rows, err := q.Query(ctx, `
		SELECT b.id::text
		FROM care_handoff_batches b
		JOIN care_requests r ON r.batch_id=b.id AND r.deleted_at IS NULL
		JOIN family_memberships target_membership ON target_membership.family_id=b.family_id
		  AND target_membership.user_id=b.target_user_id AND target_membership.status='active'
		  AND target_membership.ended_at IS NULL AND target_membership.deleted_at IS NULL
		  AND target_membership.role IN ('owner', 'caregiver')
		WHERE b.target_user_id=$1 AND b.deleted_at IS NULL
		  AND r.state IN ('sent','seen')
		GROUP BY b.id, b.created_at
		ORDER BY b.created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

func (r *Repo) AddEvent(ctx context.Context, q db.Q, requestID, actorID, action, fromState, toState, targetUserID string, payload []byte) error {
	_, err := q.Exec(ctx, "INSERT INTO care_request_events(request_id,actor_user_id,action,from_state,to_state,target_user_id,payload) VALUES($1,$2,$3,NULLIF($4,''),$5,NULLIF($6,'')::uuid,COALESCE($7::jsonb,'{}'::jsonb))", requestID, actorID, action, fromState, toState, targetUserID, payload)
	return err
}

func (r *Repo) SetState(ctx context.Context, q db.Q, id, state, responseNote string) error {
	tag, err := q.Exec(ctx, "UPDATE care_requests SET state=$2,responded_at=CASE WHEN $2 IN ('accepted','declined','delegated','expired') THEN now() ELSE responded_at END,response_note=CASE WHEN $2 IN ('accepted','declined','delegated','expired') THEN $3 ELSE response_note END WHERE id=$1 AND state IN ('sent','seen') AND deleted_at IS NULL", id, state, responseNote)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// SetAcceptedDelegated closes the previous current-responsibility record when
// that caregiver explicitly hands the same occurrence to somebody else. An
// accepted request is historical after this point; the newly inserted request
// is the only record that may become accepted next.
func (r *Repo) SetAcceptedDelegated(ctx context.Context, q db.Q, id, responseNote string) error {
	tag, err := q.Exec(ctx, "UPDATE care_requests SET state='delegated',responded_at=COALESCE(responded_at,now()),response_note=$2 WHERE id=$1 AND state='accepted' AND deleted_at IS NULL", id, responseNote)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (r *Repo) SetSeen(ctx context.Context, q db.Q, id string) (bool, error) {
	tag, err := q.Exec(ctx, "UPDATE care_requests SET state='seen',seen_at=COALESCE(seen_at,now()) WHERE id=$1 AND state='sent' AND deleted_at IS NULL", id)
	return tag.RowsAffected() > 0, err
}

func (r *Repo) AssignOccurrence(ctx context.Context, q db.Q, occurrenceID, userID, expectedCurrentUserID string) error {
	// The occurrence row is locked by the caller. Keep the guard in the UPDATE
	// as well so a second acceptance can never overwrite the current caregiver
	// if a new call path forgets to check the old assignment first.
	tag, err := q.Exec(ctx, "UPDATE care_occurrences SET assigned_to_user_id=$2 WHERE id=$1 AND status IN ('pending','missed') AND deleted_at IS NULL AND (assigned_to_user_id IS NULL OR assigned_to_user_id=$2 OR assigned_to_user_id=NULLIF($3,'')::uuid)", occurrenceID, userID, expectedCurrentUserID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}
