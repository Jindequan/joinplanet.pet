package carecoord

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/joinplanet/planet-api/internal/contracts"
	"github.com/joinplanet/planet-api/internal/platform/db"
	"github.com/joinplanet/planet-api/internal/platform/httpx"
)

const maxMessageLength = 1000

type Service struct {
	Repo     *Repo
	Pool     *pgxpool.Pool
	Guard    contracts.PetsGuard
	Notifier contracts.UserNotifier
}

// ClaimResult is the direct-responsibility projection for an occurrence that
// had no open handoff request. It changes only this occurrence; it never
// changes the standing care-plan assignments.
type ClaimResult struct {
	OccurrenceID     string `json:"occurrence_id"`
	PetID            string `json:"pet_id"`
	Title            string `json:"title"`
	AssignedToUserID string `json:"assigned_to_user_id"`
	AssignedToName   string `json:"assigned_to_name"`
}

// BatchItemResult makes partial acceptance explicit. A handoff batch is a
// presentation and idempotency envelope; each result still belongs to one
// existing Occurrence and one Care Request.
type BatchItemResult struct {
	OccurrenceID string `json:"occurrence_id"`
	RequestID    string `json:"request_id"`
	Outcome      string `json:"outcome"`
	Reason       string `json:"reason,omitempty"`
	State        string `json:"state"`
}

type HandoffBatchView struct {
	ID             string     `json:"id"`
	FamilyID       string     `json:"family_id"`
	FamilyTimezone string     `json:"family_timezone"`
	FromUserID     string     `json:"from_user_id"`
	FromUserName   string     `json:"from_user_name,omitempty"`
	TargetUserID   string     `json:"target_user_id"`
	TargetUserName string     `json:"target_user_name,omitempty"`
	Message        string     `json:"message"`
	StartsAt       *time.Time `json:"starts_at,omitempty"`
	EndsAt         *time.Time `json:"ends_at,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	Requests       []Request  `json:"requests"`
	TotalCount     int        `json:"total_count"`
	OpenCount      int        `json:"open_count"`
	AcceptedCount  int        `json:"accepted_count"`
	DeclinedCount  int        `json:"declined_count"`
	ResolvedCount  int        `json:"resolved_count"`
}

type BatchResponse struct {
	Batch   HandoffBatchView  `json:"batch"`
	Results []BatchItemResult `json:"results,omitempty"`
}

// BatchDelegationResponse keeps the new grouped action card separate from the
// previous one. Both envelopes still point at the same Occurrences; the new
// batch only groups the next responsibility handoff.
type BatchDelegationResponse struct {
	Batch         HandoffBatchView  `json:"batch"`
	PreviousBatch *HandoffBatchView `json:"previous_batch,omitempty"`
	Results       []BatchItemResult `json:"results,omitempty"`
}

func validateMessage(message string) (string, error) {
	message = strings.TrimSpace(message)
	if len(message) > maxMessageLength {
		return "", httpx.ErrValidation("message too long")
	}
	return message, nil
}

func noRows(err error) bool { return errors.Is(err, pgx.ErrNoRows) }

func (s *Service) requireTargetNotPreviouslyDeclined(ctx context.Context, q db.Q, occurrenceID, targetUserID string) error {
	blocked, err := s.Repo.PreviouslyDeclinedTarget(ctx, q, occurrenceID, targetUserID)
	if err != nil {
		return err
	}
	if blocked {
		return httpx.NewAppError(409, "CARE_REQUEST_TARGET_PREVIOUSLY_DECLINED", "target already declined this care occurrence")
	}
	return nil
}

// closeAcceptedResponsibility records the handoff from the caregiver who is
// currently responsible. The old request remains in the chain as delegated;
// it must not stay accepted after a new request is created for the same
// occurrence, otherwise two people appear to own one care action.
func (s *Service) closeAcceptedResponsibility(ctx context.Context, q db.Q, occurrenceID, currentUserID, nextTargetUserID, message string) error {
	previous, err := s.Repo.AcceptedForTargetForUpdate(ctx, q, occurrenceID, currentUserID)
	if noRows(err) {
		return nil
	}
	if err != nil {
		return err
	}
	if err := s.Repo.SetAcceptedDelegated(ctx, q, previous.ID, message); err != nil {
		return err
	}
	payload, _ := json.Marshal(map[string]any{
		"message":        message,
		"target_user_id": nextTargetUserID,
		"source":         "accepted_responsibility_handoff",
	})
	return s.Repo.AddEvent(ctx, q, previous.ID, currentUserID, "delegated", "accepted", "delegated", nextTargetUserID, payload)
}

func (s *Service) Inbox(ctx context.Context, userID string) ([]Request, error) {
	return s.Repo.ListInbox(ctx, s.Pool, userID)
}

func (s *Service) Sent(ctx context.Context, userID string) ([]Request, error) {
	return s.Repo.ListSent(ctx, s.Pool, userID)
}

func (s *Service) OpenForTarget(ctx context.Context, q contracts.Q, occurrenceID, userID string) (bool, error) {
	return s.Repo.OpenForTarget(ctx, q, occurrenceID, userID)
}

func (s *Service) AcceptedForOther(ctx context.Context, q contracts.Q, occurrenceID, userID string) (bool, error) {
	return s.Repo.AcceptedForOther(ctx, q, occurrenceID, userID)
}

// CancelOpenForOccurrence closes action cards that lost their meaning because
// the underlying occurrence was completed or skipped. It is called inside the
// task transaction, so a committed care fact can never leave an open handoff
// request behind.
func (s *Service) CancelOpenForOccurrence(ctx context.Context, q contracts.Q, occurrenceID, actorID, reason string) ([]contracts.CareRequestCancellationNotice, error) {
	requests, err := s.Repo.ListOpenForOccurrenceForUpdate(ctx, q, occurrenceID)
	if err != nil {
		return nil, err
	}
	actorLabel, err := s.Repo.UserLabel(ctx, q, actorID)
	if err != nil {
		return nil, err
	}
	if actorLabel != "" {
		switch reason {
		case "照护已完成":
			reason = "照护已由 " + actorLabel + " 完成"
		case "照护事项已跳过":
			reason = "照护事项已由 " + actorLabel + " 跳过"
		default:
			reason += "（处理人：" + actorLabel + "）"
		}
	}
	var notices []contracts.CareRequestCancellationNotice
	for _, request := range requests {
		if err := s.Repo.SetState(ctx, q, request.ID, "cancelled", reason); err != nil {
			return nil, err
		}
		payload, _ := json.Marshal(map[string]any{
			"reason": reason,
			"source": "occurrence_resolved",
		})
		if err := s.Repo.AddEvent(ctx, q, request.ID, actorID, "cancelled", request.State, "cancelled", "", payload); err != nil {
			return nil, err
		}
		for _, userID := range []string{request.FromUserID, request.TargetUserID} {
			if userID == actorID || userID == "" {
				continue
			}
			notices = append(notices, contracts.CareRequestCancellationNotice{
				UserID: userID, RequestID: request.ID, FamilyID: request.FamilyID, PetID: request.PetID, PetName: request.PetName,
				Title: request.OccurrenceTitle, Body: requestResolutionBody(request, reason),
			})
		}
	}
	return notices, nil
}

// CancelOpenForFamilyMember closes requests that involve a member who is
// leaving the Family. The request facts remain in the chain, but no action
// card may continue pointing at a user who no longer has Family access.
func (s *Service) CancelOpenForFamilyMember(ctx context.Context, q contracts.Q, familyID, memberID, actorID, reason string) ([]contracts.CareRequestCancellationNotice, error) {
	requests, err := s.Repo.ListOpenForFamilyMemberForUpdate(ctx, q, familyID, memberID)
	if err != nil {
		return nil, err
	}
	actorLabel, err := s.Repo.UserLabel(ctx, q, actorID)
	if err != nil {
		return nil, err
	}
	if actorLabel != "" {
		reason += "（处理人：" + actorLabel + "）"
	}
	var notices []contracts.CareRequestCancellationNotice
	for _, request := range requests {
		if err := s.Repo.SetState(ctx, q, request.ID, "cancelled", reason); err != nil {
			return nil, err
		}
		payload, _ := json.Marshal(map[string]any{
			"reason": reason,
			"source": "family_member_removed",
		})
		if err := s.Repo.AddEvent(ctx, q, request.ID, actorID, "cancelled", request.State, "cancelled", "", payload); err != nil {
			return nil, err
		}
		for _, userID := range []string{request.FromUserID, request.TargetUserID} {
			if userID == actorID || userID == memberID || userID == "" {
				continue
			}
			notices = append(notices, contracts.CareRequestCancellationNotice{
				UserID: userID, RequestID: request.ID, FamilyID: request.FamilyID, PetID: request.PetID, PetName: request.PetName,
				Title: request.OccurrenceTitle, Body: requestResolutionBody(request, reason),
			})
		}
	}
	return notices, nil
}

func (s *Service) Get(ctx context.Context, userID, requestID string) (Request, error) {
	req, err := s.Repo.Get(ctx, s.Pool, requestID)
	if noRows(err) {
		return Request{}, httpx.ErrNotFound("care request not found")
	}
	if err != nil {
		// Deep links can contain malformed or stale identifiers. Never let the
		// database's UUID parser turn that client input into a 500 response.
		return Request{}, httpx.MapDBErr(err)
	}
	// A notification can outlive a family membership. Re-check current pet
	// access before allowing even read-only chain inspection, while keeping
	// archived pets readable for existing authorized members.
	if s.Guard != nil {
		auth, _ := contracts.AuthFrom(ctx)
		auth.UserID = userID
		if _, _, guardErr := s.Guard.RequirePet(contracts.WithAuth(ctx, auth), req.PetID, false, false); guardErr != nil {
			return Request{}, httpx.ErrNotFound("care request not found")
		}
	}
	if req.FromUserID != userID && req.TargetUserID != userID {
		participant, participantErr := s.Repo.IsRequestParticipant(ctx, s.Pool, req.OccurrenceID, userID)
		if participantErr != nil {
			return Request{}, participantErr
		}
		if !participant {
			return Request{}, httpx.ErrNotFound("care request not found")
		}
	}
	return req, nil
}

// Chain returns the visible request history for one occurrence. Authorization
// is checked against the requested request first, so a prior participant can
// read the same responsibility chain without gaining action permissions.
func (s *Service) Chain(ctx context.Context, userID, requestID string) ([]Request, error) {
	req, err := s.Get(ctx, userID, requestID)
	if err != nil {
		return nil, err
	}
	return s.Repo.ListChain(ctx, s.Pool, req.OccurrenceID)
}

func (s *Service) Create(ctx context.Context, fromUserID, familyID, occurrenceID, targetUserID, message, idempotencyKey string) (Request, error) {
	message, err := validateMessage(message)
	if err != nil {
		return Request{}, err
	}
	if familyID == "" || targetUserID == "" {
		return Request{}, httpx.ErrValidation("family_id and target_user_id are required")
	}
	if fromUserID == targetUserID {
		return Request{}, httpx.ErrValidation("target_user_id must be another family member")
	}
	var out Request
	var replayed bool
	err = db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		occ, err := s.Repo.GetOccurrenceForUpdate(ctx, tx, occurrenceID, familyID)
		if noRows(err) {
			return httpx.ErrNotFound("care occurrence not found")
		}
		if err != nil {
			return err
		}
		if _, _, err := s.Guard.RequirePetInTx(ctx, tx, occ.PetID, fromUserID, false, true); err != nil {
			return err
		}
		if occ.AssignedToUserID != nil && *occ.AssignedToUserID != fromUserID {
			return httpx.NewAppError(409, "CARE_OCCURRENCE_ASSIGNED", "only the current caregiver can transfer this occurrence")
		}
		ok, err := s.Repo.FamilyHasPetAndMembers(ctx, tx, familyID, occ.PetID, fromUserID, targetUserID)
		if err != nil {
			return err
		}
		if !ok {
			return httpx.ErrNotFound("target is not an active family member for this pet")
		}
		claim, err := db.ClaimIdempotency(ctx, tx, fromUserID, "care-request-create:"+occurrenceID, idempotencyKey,
			db.RequestHash(familyID, occurrenceID, targetUserID, message))
		if errors.Is(err, db.ErrIdempotencyKeyReused) {
			return httpx.NewAppError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different request")
		}
		if err != nil {
			return err
		}
		if claim.Replay {
			replayed = true
			out, err = s.Repo.Get(ctx, tx, claim.ResourceID)
			return err
		}
		if occ.Status != "pending" && occ.Status != "missed" {
			return httpx.NewAppError(409, "CARE_OCCURRENCE_RESOLVED", "care occurrence is no longer actionable")
		}
		open, err := s.Repo.OpenForOccurrence(ctx, tx, occurrenceID)
		if err != nil {
			return err
		}
		if open {
			return httpx.NewAppError(409, "CARE_REQUEST_OPEN", "this care occurrence already has an open request")
		}
		if err := s.requireTargetNotPreviouslyDeclined(ctx, tx, occurrenceID, targetUserID); err != nil {
			return err
		}
		if err := s.closeAcceptedResponsibility(ctx, tx, occurrenceID, fromUserID, targetUserID, message); err != nil {
			return err
		}
		var supersedes *string
		latest, latestErr := s.Repo.LatestForOccurrence(ctx, tx, occurrenceID)
		if latestErr == nil {
			supersedes = &latest.ID
		} else if !noRows(latestErr) {
			return latestErr
		}
		out, err = s.Repo.Insert(ctx, tx, Request{
			FamilyID: familyID, PetID: occ.PetID, OccurrenceID: occurrenceID,
			FromUserID: fromUserID, TargetUserID: targetUserID, Message: message,
		}, supersedes)
		if err != nil {
			return mapConstraintError(err)
		}
		payload, _ := json.Marshal(map[string]any{"message": message})
		if err := s.Repo.AddEvent(ctx, tx, out.ID, fromUserID, "sent", "", "sent", targetUserID, payload); err != nil {
			return err
		}
		return db.BindIdempotency(ctx, tx, fromUserID, "care-request-create:"+occurrenceID, idempotencyKey, "care_request", out.ID)
	})
	if err != nil {
		return Request{}, err
	}
	if !replayed {
		// Keep the fallback path explicit in the notification copy. Some iOS
		// system surfaces render the category card without exposing custom
		// action buttons; tapping the card must still tell the recipient what
		// to do next.
		s.notify(ctx, out.TargetUserID, out.ID, out.OccurrenceID, out.FamilyID, out.PetID, requestActionTitle(out), requestActionBody(out))
	}
	return out, nil
}

func batchView(ctx context.Context, q contracts.Q, repo *Repo, batchID string) (HandoffBatchView, error) {
	batch, err := repo.GetBatch(ctx, q, batchID)
	if err != nil {
		return HandoffBatchView{}, err
	}
	requests, err := repo.ListBatchRequests(ctx, q, batchID)
	if err != nil {
		return HandoffBatchView{}, err
	}
	out := HandoffBatchView{
		ID: batch.ID, FamilyID: batch.FamilyID, FamilyTimezone: batch.FamilyTimezone, FromUserID: batch.FromUserID,
		FromUserName: batch.FromUserName, TargetUserID: batch.TargetUserID,
		TargetUserName: batch.TargetUserName, Message: batch.Message,
		StartsAt: batch.StartsAt, EndsAt: batch.EndsAt, CreatedAt: batch.CreatedAt,
		Requests: requests, TotalCount: len(requests),
	}
	for _, request := range requests {
		switch request.State {
		case "sent", "seen":
			out.OpenCount++
		case "accepted":
			out.AcceptedCount++
		case "declined":
			out.DeclinedCount++
		}
		if request.OccurrenceStatus == "completed" || request.OccurrenceStatus == "skipped" {
			out.ResolvedCount++
		}
	}
	return out, nil
}

// CreateBatch creates one Care Request per selected Occurrence in one
// transaction. Validation happens before the first insert, so a shift
// handoff can never silently send only part of the selected window.
func (s *Service) CreateBatch(ctx context.Context, fromUserID, familyID, targetUserID string, occurrenceIDs []string, message string, startsAt, endsAt *time.Time, idempotencyKey string) (HandoffBatchView, error) {
	message, err := validateMessage(message)
	if err != nil {
		return HandoffBatchView{}, err
	}
	if familyID == "" || targetUserID == "" {
		return HandoffBatchView{}, httpx.ErrValidation("family_id and target_user_id are required")
	}
	if fromUserID == targetUserID {
		return HandoffBatchView{}, httpx.ErrValidation("target_user_id must be another family member")
	}
	if (startsAt == nil) != (endsAt == nil) {
		return HandoffBatchView{}, httpx.ErrValidation("starts_at and ends_at must be provided together")
	}
	if startsAt != nil && !endsAt.After(*startsAt) {
		return HandoffBatchView{}, httpx.ErrValidation("ends_at must be after starts_at")
	}
	if len(occurrenceIDs) == 0 || len(occurrenceIDs) > 50 {
		return HandoffBatchView{}, httpx.ErrValidation("occurrence_ids must contain 1-50 items")
	}
	ids := append([]string(nil), occurrenceIDs...)
	sort.Strings(ids)
	for i := 1; i < len(ids); i++ {
		if ids[i] == ids[i-1] {
			return HandoffBatchView{}, httpx.ErrValidation("occurrence_ids must not contain duplicates")
		}
	}

	var out HandoffBatchView
	var replayed bool
	err = db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		claim, err := db.ClaimIdempotency(ctx, tx, fromUserID, "care-handoff-batch-create:"+familyID, idempotencyKey,
			db.RequestHash(familyID, targetUserID, strings.Join(ids, ","), message, startsAtString(startsAt), startsAtString(endsAt)))
		if errors.Is(err, db.ErrIdempotencyKeyReused) {
			return httpx.NewAppError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different handoff")
		}
		if err != nil {
			return err
		}
		if claim.Replay {
			replayed = true
			out, err = batchView(ctx, tx, s.Repo, claim.ResourceID)
			return err
		}

		occurrences := make([]Occurrence, 0, len(ids))
		for _, occurrenceID := range ids {
			occ, err := s.Repo.GetOccurrenceForUpdate(ctx, tx, occurrenceID, familyID)
			if noRows(err) {
				return httpx.ErrNotFound("care occurrence not found")
			}
			if err != nil {
				return err
			}
			if s.Guard != nil {
				if _, _, err := s.Guard.RequirePetInTx(ctx, tx, occ.PetID, fromUserID, false, true); err != nil {
					return err
				}
			}
			if !((occ.Status == "pending") || (occ.Status == "missed")) {
				return httpx.NewAppError(409, "CARE_OCCURRENCE_RESOLVED", "one or more care occurrences are no longer actionable").With("occurrence_id", occ.ID)
			}
			if startsAt != nil && (occ.DueAt == nil || occ.DueAt.Before(*startsAt) || !occ.DueAt.Before(*endsAt)) {
				return httpx.NewAppError(409, "CARE_OCCURRENCE_OUTSIDE_HANDOFF_WINDOW", "one or more care occurrences fall outside the selected handoff window").With("occurrence_id", occ.ID)
			}
			if occ.AssignedToUserID != nil && *occ.AssignedToUserID != fromUserID {
				return httpx.NewAppError(409, "CARE_OCCURRENCE_ASSIGNED", "only the current caregiver can transfer this occurrence").With("occurrence_id", occ.ID)
			}
			ok, err := s.Repo.FamilyHasPetAndMembers(ctx, tx, familyID, occ.PetID, fromUserID, targetUserID)
			if err != nil {
				return err
			}
			if !ok {
				return httpx.ErrNotFound("target is not an active family member for one or more pets")
			}
			open, err := s.Repo.OpenForOccurrence(ctx, tx, occ.ID)
			if err != nil {
				return err
			}
			if open {
				return httpx.NewAppError(409, "CARE_REQUEST_OPEN", "one or more care occurrences already have an open request").With("occurrence_id", occ.ID)
			}
			if err := s.requireTargetNotPreviouslyDeclined(ctx, tx, occ.ID, targetUserID); err != nil {
				return err
			}
			occurrences = append(occurrences, occ)
		}

		batch, err := s.Repo.CreateBatch(ctx, tx, RepoBatch(familyID, fromUserID, targetUserID, message, startsAt, endsAt))
		if err != nil {
			return err
		}
		payload, _ := json.Marshal(map[string]any{"source": "shift_handoff", "batch_id": batch.ID, "message": message})
		for _, occ := range occurrences {
			if err := s.closeAcceptedResponsibility(ctx, tx, occ.ID, fromUserID, targetUserID, message); err != nil {
				return err
			}
			var supersedes *string
			latest, latestErr := s.Repo.LatestForOccurrence(ctx, tx, occ.ID)
			if latestErr == nil {
				supersedes = &latest.ID
			} else if !noRows(latestErr) {
				return latestErr
			}
			request, err := s.Repo.InsertWithBatch(ctx, tx, Request{
				FamilyID: familyID, PetID: occ.PetID, OccurrenceID: occ.ID,
				FromUserID: fromUserID, TargetUserID: targetUserID, Message: message,
			}, supersedes, batch.ID)
			if err != nil {
				return mapConstraintError(err)
			}
			if err := s.Repo.AddEvent(ctx, tx, request.ID, fromUserID, "sent", "", "sent", targetUserID, payload); err != nil {
				return err
			}
		}
		out, err = batchView(ctx, tx, s.Repo, batch.ID)
		if err != nil {
			return err
		}
		return db.BindIdempotency(ctx, tx, fromUserID, "care-handoff-batch-create:"+familyID, idempotencyKey, "care_handoff_batch", batch.ID)
	})
	if err != nil {
		return HandoffBatchView{}, err
	}
	if !replayed {
		s.notifyBatch(ctx, out.TargetUserID, out.ID, out.FamilyID, batchActionTitle(out), batchActionBody(out))
	}
	return out, nil
}

func RepoBatch(familyID, fromUserID, targetUserID, message string, startsAt, endsAt *time.Time) Batch {
	return Batch{
		FamilyID: familyID, FromUserID: fromUserID, TargetUserID: targetUserID,
		Message: message, StartsAt: startsAt, EndsAt: endsAt,
	}
}

func startsAtString(value *time.Time) string {
	if value == nil {
		return ""
	}
	return value.UTC().Format(time.RFC3339Nano)
}

func (s *Service) GetBatch(ctx context.Context, userID, batchID string) (HandoffBatchView, error) {
	batch, err := s.Repo.GetBatch(ctx, s.Pool, batchID)
	if noRows(err) {
		return HandoffBatchView{}, httpx.ErrNotFound("care handoff batch not found")
	}
	if err != nil {
		// Notification/deep-link ids are untrusted client input. Map malformed
		// UUIDs to the public validation contract instead of leaking a 500.
		return HandoffBatchView{}, httpx.MapDBErr(err)
	}
	ok, err := s.Repo.IsActiveFamilyMember(ctx, s.Pool, batch.FamilyID, userID)
	if err != nil {
		return HandoffBatchView{}, err
	}
	if !ok || (batch.FromUserID != userID && batch.TargetUserID != userID) {
		return HandoffBatchView{}, httpx.ErrNotFound("care handoff batch not found")
	}
	return batchView(ctx, s.Pool, s.Repo, batchID)
}

func (s *Service) InboxBatches(ctx context.Context, userID string) ([]HandoffBatchView, error) {
	ids, err := s.Repo.ListBatchIDsForTarget(ctx, s.Pool, userID)
	if err != nil {
		return nil, err
	}
	out := make([]HandoffBatchView, 0, len(ids))
	for _, id := range ids {
		batch, err := s.GetBatch(ctx, userID, id)
		if err != nil {
			continue
		}
		out = append(out, batch)
	}
	return out, nil
}

func (s *Service) RespondBatch(ctx context.Context, userID, batchID, action string, selectedIDs []string, idempotencyKey string) (BatchResponse, error) {
	if action != "accepted" && action != "declined" {
		return BatchResponse{}, httpx.ErrValidation("batch action must be accepted or declined")
	}
	var out BatchResponse
	var replayed bool
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		batch, err := s.Repo.GetBatch(ctx, tx, batchID)
		if noRows(err) {
			return httpx.ErrNotFound("care handoff batch not found")
		}
		if err != nil {
			return err
		}
		if batch.TargetUserID != userID {
			return httpx.ErrNotFound("care handoff batch not found")
		}
		requests, err := s.Repo.ListBatchRequests(ctx, tx, batchID)
		if err != nil {
			return err
		}
		selected := selectedSet(selectedIDs)
		if len(selected) == 0 {
			for _, request := range requests {
				selected[request.OccurrenceID] = true
			}
		}
		for occurrenceID := range selected {
			found := false
			for _, request := range requests {
				if request.OccurrenceID == occurrenceID {
					found = true
					break
				}
			}
			if !found {
				return httpx.ErrValidation("selected occurrence is not part of this handoff batch")
			}
		}
		keys := make([]string, 0, len(selected))
		for occurrenceID := range selected {
			keys = append(keys, occurrenceID)
		}
		sort.Strings(keys)
		claim, err := db.ClaimIdempotency(ctx, tx, userID, "care-handoff-batch-action:"+batchID, idempotencyKey,
			db.RequestHash(action, strings.Join(keys, ",")))
		if errors.Is(err, db.ErrIdempotencyKeyReused) {
			return httpx.NewAppError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different batch action")
		}
		if err != nil {
			return err
		}
		if claim.Replay {
			replayed = true
			view, viewErr := batchView(ctx, tx, s.Repo, batchID)
			out.Batch = view
			return viewErr
		}

		results := make([]BatchItemResult, 0, len(requests))
		var changed int
		for _, request := range requests {
			if !selected[request.OccurrenceID] {
				results = append(results, BatchItemResult{OccurrenceID: request.OccurrenceID, RequestID: request.ID, Outcome: "not_selected", State: request.State})
				continue
			}
			occ, err := s.Repo.GetOccurrenceForUpdate(ctx, tx, request.OccurrenceID, batch.FamilyID)
			if noRows(err) {
				results = append(results, BatchItemResult{OccurrenceID: request.OccurrenceID, RequestID: request.ID, Outcome: "not_actionable", Reason: "occurrence_not_found", State: request.State})
				continue
			}
			if err != nil {
				return err
			}
			current, err := s.Repo.GetForUpdate(ctx, tx, request.ID)
			if err != nil {
				return err
			}
			result := BatchItemResult{OccurrenceID: current.OccurrenceID, RequestID: current.ID, State: current.State}
			if current.State != "sent" && current.State != "seen" {
				result.Outcome = "already_resolved"
				result.Reason = current.State
				results = append(results, result)
				continue
			}
			if occ.Status != "pending" && occ.Status != "missed" {
				result.Outcome = "not_actionable"
				result.Reason = "occurrence_resolved"
				results = append(results, result)
				continue
			}
			if action == "accepted" {
				acceptedForOther, err := s.Repo.AcceptedForOther(ctx, tx, current.OccurrenceID, userID)
				if err != nil {
					return err
				}
				if acceptedForOther {
					result.Outcome = "not_actionable"
					result.Reason = "assigned_elsewhere"
					results = append(results, result)
					continue
				}
				// The sender remains the responsible caregiver until the batch
				// target explicitly accepts. An already accepted target is also
				// safe to replay, but a third party must never be overwritten.
				if occ.AssignedToUserID != nil && *occ.AssignedToUserID != batch.FromUserID && *occ.AssignedToUserID != userID {
					result.Outcome = "not_actionable"
					result.Reason = "assigned_elsewhere"
					results = append(results, result)
					continue
				}
				if err := s.Repo.AssignOccurrence(ctx, tx, current.OccurrenceID, userID, batch.FromUserID); err != nil {
					if noRows(err) {
						result.Outcome = "not_actionable"
						result.Reason = "occurrence_resolved"
						results = append(results, result)
						continue
					}
					return err
				}
			}
			if err := s.Repo.SetState(ctx, tx, current.ID, action, ""); err != nil {
				if noRows(err) {
					result.Outcome = "already_resolved"
					result.Reason = "request_changed"
					results = append(results, result)
					continue
				}
				return err
			}
			payload, _ := json.Marshal(map[string]any{"source": "shift_handoff", "batch_id": batchID})
			if err := s.Repo.AddEvent(ctx, tx, current.ID, userID, action, current.State, action, "", payload); err != nil {
				return err
			}
			result.Outcome = "changed"
			result.State = action
			results = append(results, result)
			changed++
		}
		view, err := batchView(ctx, tx, s.Repo, batchID)
		if err != nil {
			return err
		}
		out = BatchResponse{Batch: view, Results: results}
		if err := db.BindIdempotency(ctx, tx, userID, "care-handoff-batch-action:"+batchID, idempotencyKey, "care_handoff_batch", batchID); err != nil {
			return err
		}
		if changed == 0 {
			// A replay-safe no-op still returns a fully explicit per-item result;
			// callers must never interpret the batch envelope as success alone.
			return nil
		}
		return nil
	})
	if err != nil {
		return BatchResponse{}, err
	}
	if !replayed {
		changed := 0
		for _, result := range out.Results {
			if result.Outcome == "changed" {
				changed++
			}
		}
		if changed > 0 {
			s.notifyBatchStatus(ctx, out.Batch.FromUserID, out.Batch.ID, out.Batch.FamilyID, fmt.Sprintf("照护安排已更新 · %d/%d 项", changed, out.Batch.TotalCount), batchBody(out.Batch, "请查看逐项结果"))
		}
	}
	return out, nil
}

// DelegateBatch closes the selected open requests in one grouped handoff and
// creates the next grouped handoff for the same Occurrences. It never creates
// a second Occurrence or a parallel open request for any item.
func (s *Service) DelegateBatch(ctx context.Context, userID, batchID, targetUserID, message string, selectedIDs []string, idempotencyKey string) (BatchDelegationResponse, error) {
	return s.continueBatch(ctx, userID, batchID, targetUserID, message, selectedIDs, idempotencyKey, "delegate")
}

// ReassignBatch continues declined items in a grouped handoff. It mirrors the
// single-request reassign path: the declined request remains immutable history
// and the next request stays attached to the same Occurrence.
func (s *Service) ReassignBatch(ctx context.Context, userID, batchID, targetUserID, message string, selectedIDs []string, idempotencyKey string) (BatchDelegationResponse, error) {
	return s.continueBatch(ctx, userID, batchID, targetUserID, message, selectedIDs, idempotencyKey, "reassign")
}

func (s *Service) continueBatch(ctx context.Context, userID, batchID, targetUserID, message string, selectedIDs []string, idempotencyKey, mode string) (BatchDelegationResponse, error) {
	if targetUserID == "" || targetUserID == userID {
		return BatchDelegationResponse{}, httpx.ErrValidation("target_user_id must be another family member")
	}
	if mode != "delegate" && mode != "reassign" {
		return BatchDelegationResponse{}, httpx.ErrValidation("unsupported batch continuation")
	}
	message, err := validateMessage(message)
	if err != nil {
		return BatchDelegationResponse{}, err
	}
	var out BatchDelegationResponse
	var replayed bool
	err = db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		batch, err := s.Repo.GetBatchForUpdate(ctx, tx, batchID)
		if noRows(err) {
			return httpx.ErrNotFound("care handoff batch not found")
		}
		if err != nil {
			return err
		}
		if batch.TargetUserID != userID {
			return httpx.ErrNotFound("care handoff batch not found")
		}
		requests, err := s.Repo.ListBatchRequests(ctx, tx, batchID)
		if err != nil {
			return err
		}
		selected := selectedSet(selectedIDs)
		if len(selected) == 0 {
			for _, request := range requests {
				if (mode == "delegate" && (request.State == "sent" || request.State == "seen")) ||
					(mode == "reassign" && request.State == "declined") {
					selected[request.OccurrenceID] = true
				}
			}
		}
		for occurrenceID := range selected {
			found := false
			for _, request := range requests {
				if request.OccurrenceID == occurrenceID {
					found = true
					break
				}
			}
			if !found {
				return httpx.ErrValidation("selected occurrence is not part of this handoff batch")
			}
		}
		keys := make([]string, 0, len(selected))
		for occurrenceID := range selected {
			keys = append(keys, occurrenceID)
		}
		sort.Strings(keys)
		idempotencyScope := "care-handoff-batch-" + mode + ":" + batchID
		claim, err := db.ClaimIdempotency(ctx, tx, userID, idempotencyScope, idempotencyKey, db.RequestHash(targetUserID, message, strings.Join(keys, ",")))
		if errors.Is(err, db.ErrIdempotencyKeyReused) {
			return httpx.NewAppError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different batch continuation")
		}
		if err != nil {
			return err
		}
		if claim.Replay {
			replayed = true
			view, viewErr := batchView(ctx, tx, s.Repo, claim.ResourceID)
			out.Batch = view
			return viewErr
		}

		results := make([]BatchItemResult, 0, len(requests))
		type handoffItem struct {
			request    Request
			occurrence Occurrence
		}
		items := make([]handoffItem, 0, len(selected))
		for _, request := range requests {
			if !selected[request.OccurrenceID] {
				results = append(results, BatchItemResult{OccurrenceID: request.OccurrenceID, RequestID: request.ID, Outcome: "not_selected", State: request.State})
				continue
			}
			occ, err := s.Repo.GetOccurrenceForUpdate(ctx, tx, request.OccurrenceID, batch.FamilyID)
			if noRows(err) {
				results = append(results, BatchItemResult{OccurrenceID: request.OccurrenceID, RequestID: request.ID, Outcome: "not_actionable", Reason: "occurrence_not_found", State: request.State})
				continue
			}
			if err != nil {
				return err
			}
			current, err := s.Repo.GetForUpdate(ctx, tx, request.ID)
			if err != nil {
				return err
			}
			result := BatchItemResult{OccurrenceID: current.OccurrenceID, RequestID: current.ID, State: current.State}
			validState := (mode == "delegate" && (current.State == "sent" || current.State == "seen")) ||
				(mode == "reassign" && current.State == "declined")
			if !validState {
				result.Outcome = "already_resolved"
				result.Reason = current.State
				results = append(results, result)
				continue
			}
			if occ.Status != "pending" && occ.Status != "missed" {
				result.Outcome = "not_actionable"
				result.Reason = "occurrence_resolved"
				results = append(results, result)
				continue
			}
			if mode == "reassign" {
				open, err := s.Repo.OpenForOccurrence(ctx, tx, current.OccurrenceID)
				if err != nil {
					return err
				}
				if open {
					result.Outcome = "not_actionable"
					result.Reason = "occurrence_open"
					results = append(results, result)
					continue
				}
			}
			ok, err := s.Repo.FamilyHasPetAndMembers(ctx, tx, batch.FamilyID, occ.PetID, userID, targetUserID)
			if err != nil {
				return err
			}
			if !ok {
				return httpx.ErrNotFound("target is not an active family member for one or more pets")
			}
			previouslyDeclined, err := s.Repo.PreviouslyDeclinedTarget(ctx, tx, current.OccurrenceID, targetUserID)
			if err != nil {
				return err
			}
			if previouslyDeclined {
				result.Outcome = "not_actionable"
				result.Reason = "target_previously_declined"
				results = append(results, result)
				continue
			}
			items = append(items, handoffItem{request: current, occurrence: occ})
		}

		if len(items) == 0 {
			view, err := batchView(ctx, tx, s.Repo, batchID)
			if err != nil {
				return err
			}
			out = BatchDelegationResponse{Batch: view, Results: results}
			return db.BindIdempotency(ctx, tx, userID, idempotencyScope, idempotencyKey, "care_handoff_batch", batchID)
		}

		nextBatch, err := s.Repo.CreateBatch(ctx, tx, RepoBatch(batch.FamilyID, userID, targetUserID, message, batch.StartsAt, batch.EndsAt))
		if err != nil {
			return err
		}
		payload, _ := json.Marshal(map[string]any{"source": "shift_handoff_" + mode, "previous_batch_id": batchID, "batch_id": nextBatch.ID, "message": message})
		for _, item := range items {
			action := "reassigned"
			toState := item.request.State
			if mode == "delegate" {
				action = "delegated"
				toState = "delegated"
				if err := s.Repo.SetState(ctx, tx, item.request.ID, toState, message); err != nil {
					return err
				}
			}
			if err := s.Repo.AddEvent(ctx, tx, item.request.ID, userID, action, item.request.State, toState, targetUserID, payload); err != nil {
				return err
			}
			request, err := s.Repo.InsertWithBatch(ctx, tx, Request{
				FamilyID: batch.FamilyID, PetID: item.occurrence.PetID, OccurrenceID: item.occurrence.ID,
				FromUserID: userID, TargetUserID: targetUserID, Message: message,
			}, &item.request.ID, nextBatch.ID)
			if err != nil {
				return mapConstraintError(err)
			}
			results = append(results, BatchItemResult{OccurrenceID: item.occurrence.ID, RequestID: request.ID, Outcome: "changed", State: "sent"})
		}
		previousView, err := batchView(ctx, tx, s.Repo, batchID)
		if err != nil {
			return err
		}
		nextView, err := batchView(ctx, tx, s.Repo, nextBatch.ID)
		if err != nil {
			return err
		}
		out = BatchDelegationResponse{Batch: nextView, PreviousBatch: &previousView, Results: results}
		return db.BindIdempotency(ctx, tx, userID, idempotencyScope, idempotencyKey, "care_handoff_batch", nextBatch.ID)
	})
	if err != nil {
		return BatchDelegationResponse{}, err
	}
	if !replayed && out.PreviousBatch != nil {
		changed := 0
		for _, result := range out.Results {
			if result.Outcome == "changed" {
				changed++
			}
		}
		if changed > 0 {
			s.notifyBatch(ctx, out.Batch.TargetUserID, out.Batch.ID, out.Batch.FamilyID, batchActionTitle(out.Batch), batchActionBody(out.Batch))
			// If the next target is the original sender, the actionable card is
			// already the complete feedback. Sending a second status receipt to
			// the same person would duplicate the handoff signal.
			if out.Batch.TargetUserID != out.PreviousBatch.FromUserID {
				s.notifyBatchStatus(ctx, out.PreviousBatch.FromUserID, out.PreviousBatch.ID, out.PreviousBatch.FamilyID, fmt.Sprintf("照护安排已继续转给下一位 · %d/%d 项", changed, out.PreviousBatch.TotalCount), batchBody(*out.PreviousBatch, "请查看逐项结果"))
			}
		}
	}
	return out, nil
}

func selectedSet(ids []string) map[string]bool {
	out := make(map[string]bool, len(ids))
	for _, id := range ids {
		if strings.TrimSpace(id) != "" {
			out[id] = true
		}
	}
	return out
}

func batchBody(batch HandoffBatchView, prefix string) string {
	body := fmt.Sprintf("%s：共 %d 项", prefix, batch.TotalCount)
	if len(batch.Requests) > 0 {
		const maxPreviewItems = 2
		preview := make([]string, 0, minInt(len(batch.Requests), maxPreviewItems))
		for _, request := range batch.Requests[:minInt(len(batch.Requests), maxPreviewItems)] {
			item := request.PetName
			if request.OccurrenceTitle != "" {
				item += " · " + request.OccurrenceTitle
			}
			if dueTime := requestDueTimeForTimezone(request, batch.FamilyTimezone); dueTime != "" {
				item += " " + dueTime
			}
			preview = append(preview, item)
		}
		if remaining := len(batch.Requests) - len(preview); remaining > 0 {
			preview = append(preview, fmt.Sprintf("还有 %d 项", remaining))
		}
		body += " · " + strings.Join(preview, "；")
	}
	if batch.Message != "" {
		body += " · " + batch.Message
	}
	return body
}

func batchActionBody(batch HandoffBatchView) string {
	return batchBody(batch, "请选你能做的") + " · 打开 PLANET 处理"
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func requestDueTimeForTimezone(req Request, timezone string) string {
	if req.FamilyTimezone == "" {
		req.FamilyTimezone = timezone
	}
	return requestDueTime(req)
}

// Claim takes responsibility for one unassigned occurrence. It is deliberately
// separate from accepting a Care Request: an open request must be answered by
// its target, so a family member cannot silently bypass the responsibility
// chain by claiming the underlying item.
func (s *Service) Claim(ctx context.Context, userID, familyID, occurrenceID, idempotencyKey string) (ClaimResult, error) {
	if familyID == "" || occurrenceID == "" {
		return ClaimResult{}, httpx.ErrValidation("family_id and occurrence_id are required")
	}
	var out ClaimResult
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		occ, err := s.Repo.GetOccurrenceForUpdate(ctx, tx, occurrenceID, familyID)
		if noRows(err) {
			return httpx.ErrNotFound("care occurrence not found")
		}
		if err != nil {
			return err
		}
		if _, _, err := s.Guard.RequirePetInTx(ctx, tx, occ.PetID, userID, false, true); err != nil {
			return err
		}
		ok, err := s.Repo.FamilyHasPetAndMembers(ctx, tx, familyID, occ.PetID, userID, userID)
		if err != nil {
			return err
		}
		if !ok {
			return httpx.ErrNotFound("user is not an active member of this pet family")
		}

		claim, err := db.ClaimIdempotency(ctx, tx, userID, "care-occurrence-claim:"+occurrenceID, idempotencyKey,
			db.RequestHash(familyID, occurrenceID))
		if errors.Is(err, db.ErrIdempotencyKeyReused) {
			return httpx.NewAppError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different request")
		}
		if err != nil {
			return err
		}

		out = ClaimResult{
			OccurrenceID:     occ.ID,
			PetID:            occ.PetID,
			Title:            occ.Title,
			AssignedToUserID: userID,
		}
		if claim.Replay {
			out.AssignedToName, err = s.Repo.UserLabel(ctx, tx, userID)
			return err
		}
		if occ.Status != "pending" && occ.Status != "missed" {
			return httpx.NewAppError(409, "CARE_OCCURRENCE_RESOLVED", "care occurrence is no longer actionable")
		}
		if occ.AssignedToUserID != nil && *occ.AssignedToUserID != userID {
			return httpx.NewAppError(409, "CARE_OCCURRENCE_ASSIGNED", "only the current caregiver can complete this occurrence")
		}
		open, err := s.Repo.OpenForOccurrence(ctx, tx, occurrenceID)
		if err != nil {
			return err
		}
		if open {
			return httpx.NewAppError(409, "CARE_REQUEST_RESPONSE_REQUIRED", "please respond to the care request before claiming this occurrence")
		}
		if occ.AssignedToUserID == nil {
			if err := s.Repo.AssignOccurrence(ctx, tx, occurrenceID, userID, ""); err != nil {
				if noRows(err) {
					return httpx.NewAppError(409, "CARE_OCCURRENCE_RESOLVED", "care occurrence is no longer actionable")
				}
				return err
			}
		}
		out.AssignedToName, err = s.Repo.UserLabel(ctx, tx, userID)
		if err != nil {
			return err
		}
		return db.BindIdempotency(ctx, tx, userID, "care-occurrence-claim:"+occurrenceID, idempotencyKey, "care_occurrence", occurrenceID)
	})
	if err != nil {
		return ClaimResult{}, err
	}
	return out, nil
}

func (s *Service) Accept(ctx context.Context, userID, requestID, responseNote, idempotencyKey string) (Request, error) {
	return s.respond(ctx, userID, requestID, "accepted", responseNote, idempotencyKey)
}

func (s *Service) Decline(ctx context.Context, userID, requestID, responseNote, idempotencyKey string) (Request, error) {
	return s.respond(ctx, userID, requestID, "declined", responseNote, idempotencyKey)
}

func (s *Service) respond(ctx context.Context, userID, requestID, action, responseNote, idempotencyKey string) (Request, error) {
	responseNote, err := validateMessage(responseNote)
	if err != nil {
		return Request{}, err
	}
	var out Request
	var replayed bool
	err = db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		// Accepted handoffs update both the request and its Occurrence. Keep the
		// lock order identical to task completion (Occurrence -> request), so a
		// simultaneous accept/complete cannot deadlock the database.
		req, err := s.Repo.Get(ctx, tx, requestID)
		if noRows(err) {
			return httpx.ErrNotFound("care request not found")
		}
		if err != nil {
			return err
		}
		if req.TargetUserID != userID {
			return httpx.ErrNotFound("care request not found")
		}
		if action == "accepted" {
			if _, err := s.Repo.GetOccurrenceForUpdate(ctx, tx, req.OccurrenceID, req.FamilyID); noRows(err) {
				return httpx.NewAppError(409, "CARE_OCCURRENCE_RESOLVED", "care occurrence is no longer actionable")
			} else if err != nil {
				return err
			}
		}
		req, err = s.Repo.GetForUpdate(ctx, tx, requestID)
		if noRows(err) {
			return httpx.ErrNotFound("care request not found")
		}
		if err != nil {
			return err
		}
		if req.TargetUserID != userID {
			return httpx.ErrNotFound("care request not found")
		}
		if s.Guard != nil {
			if _, _, err := s.Guard.RequirePetInTx(ctx, tx, req.PetID, userID, false, true); err != nil {
				return err
			}
		}
		claim, err := db.ClaimIdempotency(ctx, tx, userID, "care-request-action:"+requestID, idempotencyKey,
			db.RequestHash(action, responseNote))
		if errors.Is(err, db.ErrIdempotencyKeyReused) {
			return httpx.NewAppError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different request")
		}
		if err != nil {
			return err
		}
		if claim.Replay {
			replayed = true
			out, err = s.Repo.Get(ctx, tx, claim.ResourceID)
			return err
		}
		if req.State != "sent" && req.State != "seen" {
			return httpx.NewAppError(409, "CARE_REQUEST_NOT_ACTIONABLE", "care request is no longer actionable")
		}
		if action == "accepted" {
			acceptedForOther, err := s.Repo.AcceptedForOther(ctx, tx, req.OccurrenceID, userID)
			if err != nil {
				return err
			}
			if acceptedForOther {
				return httpx.NewAppError(409, "CARE_OCCURRENCE_ASSIGNED", "this care occurrence already has another current caregiver")
			}
			if err := s.Repo.AssignOccurrence(ctx, tx, req.OccurrenceID, userID, req.FromUserID); err != nil {
				if noRows(err) {
					return httpx.NewAppError(409, "CARE_OCCURRENCE_RESOLVED", "care occurrence is no longer actionable")
				}
				return err
			}
		}
		if err := s.Repo.SetState(ctx, tx, requestID, action, responseNote); err != nil {
			if noRows(err) {
				return httpx.NewAppError(409, "CARE_REQUEST_NOT_ACTIONABLE", "care request is no longer actionable")
			}
			return err
		}
		payload, _ := json.Marshal(map[string]any{"response_note": responseNote})
		if err := s.Repo.AddEvent(ctx, tx, requestID, userID, action, req.State, action, "", payload); err != nil {
			return err
		}
		out, err = s.Repo.Get(ctx, tx, requestID)
		if err != nil {
			return err
		}
		return db.BindIdempotency(ctx, tx, userID, "care-request-action:"+requestID, idempotencyKey, "care_request", requestID)
	})
	if err != nil {
		return Request{}, err
	}
	if !replayed {
		body := "已确认负责"
		if action == "declined" {
			body = "暂时不能做，请继续安排"
		}
		// The requester receives a status receipt, not an action card. Only the
		// current target is allowed to accept/decline/delegate this request.
		s.notifyStatus(ctx, out.FromUserID, out.ID, out.FamilyID, out.PetID, fmt.Sprintf("%s 的照护安排", out.PetName), requestBody(out, body))
	}
	return out, nil
}

func (s *Service) Delegate(ctx context.Context, userID, requestID, targetUserID, message, idempotencyKey string) (Request, error) {
	message, err := validateMessage(message)
	if err != nil {
		return Request{}, err
	}
	if targetUserID == "" || targetUserID == userID {
		return Request{}, httpx.ErrValidation("target_user_id must be another family member")
	}
	var out Request
	var replayed bool
	err = db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		req, err := s.Repo.GetForUpdate(ctx, tx, requestID)
		if noRows(err) {
			return httpx.ErrNotFound("care request not found")
		}
		if err != nil {
			return err
		}
		if req.TargetUserID != userID {
			return httpx.ErrNotFound("care request not found")
		}
		if s.Guard != nil {
			if _, _, err := s.Guard.RequirePetInTx(ctx, tx, req.PetID, userID, false, true); err != nil {
				return err
			}
		}
		claim, err := db.ClaimIdempotency(ctx, tx, userID, "care-request-delegate:"+requestID, idempotencyKey,
			db.RequestHash(targetUserID, message))
		if errors.Is(err, db.ErrIdempotencyKeyReused) {
			return httpx.NewAppError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different request")
		}
		if err != nil {
			return err
		}
		if claim.Replay {
			replayed = true
			out, err = s.Repo.Get(ctx, tx, claim.ResourceID)
			return err
		}
		if req.State != "sent" && req.State != "seen" {
			return httpx.NewAppError(409, "CARE_REQUEST_NOT_ACTIONABLE", "care request is no longer actionable")
		}
		ok, err := s.Repo.FamilyHasPetAndMembers(ctx, tx, req.FamilyID, req.PetID, userID, targetUserID)
		if err != nil {
			return err
		}
		if !ok {
			return httpx.ErrNotFound("target is not an active family member for this pet")
		}
		if err := s.requireTargetNotPreviouslyDeclined(ctx, tx, req.OccurrenceID, targetUserID); err != nil {
			return err
		}
		if err := s.Repo.SetState(ctx, tx, requestID, "delegated", message); err != nil {
			if noRows(err) {
				return httpx.NewAppError(409, "CARE_REQUEST_NOT_ACTIONABLE", "care request is no longer actionable")
			}
			return err
		}
		payload, _ := json.Marshal(map[string]any{"message": message, "target_user_id": targetUserID})
		if err := s.Repo.AddEvent(ctx, tx, requestID, userID, "delegated", req.State, "delegated", targetUserID, payload); err != nil {
			return err
		}
		out, err = s.Repo.Insert(ctx, tx, Request{
			FamilyID: req.FamilyID, PetID: req.PetID, OccurrenceID: req.OccurrenceID,
			FromUserID: userID, TargetUserID: targetUserID, Message: message,
		}, &requestID)
		if err != nil {
			return mapConstraintError(err)
		}
		if err := s.Repo.AddEvent(ctx, tx, out.ID, userID, "sent", "", "sent", targetUserID, payload); err != nil {
			return err
		}
		return db.BindIdempotency(ctx, tx, userID, "care-request-delegate:"+requestID, idempotencyKey, "care_request", out.ID)
	})
	if err != nil {
		return Request{}, err
	}
	if !replayed {
		s.notify(ctx, out.TargetUserID, out.ID, out.OccurrenceID, out.FamilyID, out.PetID, requestActionTitle(out), requestBody(out, "请确认是否能做"))
		s.notifyHandoffParticipants(ctx, out, userID)
	}
	return out, nil
}

// Reassign continues a declined request without pretending that the original
// recipient accepted it. The declined request remains immutable history; the
// returned request is the new actionable handoff in the chain.
func (s *Service) Reassign(ctx context.Context, userID, requestID, targetUserID, message, idempotencyKey string) (Request, error) {
	message, err := validateMessage(message)
	if err != nil {
		return Request{}, err
	}
	if targetUserID == "" || targetUserID == userID {
		return Request{}, httpx.ErrValidation("target_user_id must be another family member")
	}
	var out Request
	var replayed bool
	err = db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		req, err := s.Repo.GetForUpdate(ctx, tx, requestID)
		if noRows(err) {
			return httpx.ErrNotFound("care request not found")
		}
		if err != nil {
			return err
		}
		if req.TargetUserID != userID {
			return httpx.ErrNotFound("care request not found")
		}
		if s.Guard != nil {
			if _, _, err := s.Guard.RequirePetInTx(ctx, tx, req.PetID, userID, false, true); err != nil {
				return err
			}
		}
		claim, err := db.ClaimIdempotency(ctx, tx, userID, "care-request-reassign:"+requestID, idempotencyKey,
			db.RequestHash(targetUserID, message))
		if errors.Is(err, db.ErrIdempotencyKeyReused) {
			return httpx.NewAppError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different request")
		}
		if err != nil {
			return err
		}
		if claim.Replay {
			replayed = true
			out, err = s.Repo.Get(ctx, tx, claim.ResourceID)
			return err
		}
		if req.State != "declined" {
			return httpx.NewAppError(409, "CARE_REQUEST_NOT_REASSIGNABLE", "care request must be declined before reassignment")
		}
		ok, err := s.Repo.FamilyHasPetAndMembers(ctx, tx, req.FamilyID, req.PetID, userID, targetUserID)
		if err != nil {
			return err
		}
		if !ok {
			return httpx.ErrNotFound("target is not an active family member for this pet")
		}
		if err := s.requireTargetNotPreviouslyDeclined(ctx, tx, req.OccurrenceID, targetUserID); err != nil {
			return err
		}
		open, err := s.Repo.OpenForOccurrence(ctx, tx, req.OccurrenceID)
		if err != nil {
			return err
		}
		if open {
			return httpx.NewAppError(409, "CARE_REQUEST_OPEN", "this care occurrence already has an open request")
		}
		payload, _ := json.Marshal(map[string]any{"message": message, "target_user_id": targetUserID})
		if err := s.Repo.AddEvent(ctx, tx, requestID, userID, "reassigned", "declined", "declined", targetUserID, payload); err != nil {
			return err
		}
		out, err = s.Repo.Insert(ctx, tx, Request{
			FamilyID: req.FamilyID, PetID: req.PetID, OccurrenceID: req.OccurrenceID,
			FromUserID: userID, TargetUserID: targetUserID, Message: message,
		}, &requestID)
		if err != nil {
			return mapConstraintError(err)
		}
		if err := s.Repo.AddEvent(ctx, tx, out.ID, userID, "sent", "", "sent", targetUserID, payload); err != nil {
			return err
		}
		return db.BindIdempotency(ctx, tx, userID, "care-request-reassign:"+requestID, idempotencyKey, "care_request", out.ID)
	})
	if err != nil {
		return Request{}, err
	}
	if !replayed {
		s.notify(ctx, out.TargetUserID, out.ID, out.OccurrenceID, out.FamilyID, out.PetID, requestActionTitle(out), requestBody(out, "请确认是否能做"))
		s.notifyHandoffParticipants(ctx, out, userID)
	}
	return out, nil
}

func (s *Service) MarkSeen(ctx context.Context, userID, requestID string) (Request, error) {
	var out Request
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		req, err := s.Repo.GetForUpdate(ctx, tx, requestID)
		if noRows(err) {
			return httpx.ErrNotFound("care request not found")
		}
		if err != nil {
			return err
		}
		if req.TargetUserID != userID {
			return httpx.ErrNotFound("care request not found")
		}
		if req.State == "sent" {
			changed, err := s.Repo.SetSeen(ctx, tx, requestID)
			if err != nil {
				return err
			}
			if changed {
				if err := s.Repo.AddEvent(ctx, tx, requestID, userID, "seen", "sent", "seen", "", nil); err != nil {
					return err
				}
			}
		}
		out, err = s.Repo.Get(ctx, tx, requestID)
		return err
	})
	return out, err
}

// ExpireDueForFamily closes sent/seen requests whose occurrence has passed its
// due time. The request row is locked in the same transaction as the state
// transition, so an expiry and an accept can never both win.
func (s *Service) ExpireDueForFamily(ctx context.Context, familyID string, now time.Time) (int, error) {
	var expired []Request
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		ids, err := s.Repo.DueForExpiry(ctx, tx, familyID, now)
		if err != nil {
			return err
		}
		for _, id := range ids {
			req, err := s.Repo.GetForUpdate(ctx, tx, id)
			if noRows(err) {
				continue
			}
			if err != nil {
				return err
			}
			if req.State != "sent" && req.State != "seen" {
				continue
			}
			if err := s.Repo.SetState(ctx, tx, id, "expired", "这项照护已到时间，还没有人负责"); err != nil {
				if noRows(err) {
					continue
				}
				return err
			}
			payload, _ := json.Marshal(map[string]any{"reason": "due_at_passed"})
			// care_request_events 要求真实用户作为 actor；目标成员是这张
			// 行动卡的责任接收者，事件 payload 会明确这是系统过期动作。
			if err := s.Repo.AddEvent(ctx, tx, id, req.TargetUserID, "expired", req.State, "expired", "", payload); err != nil {
				return err
			}
			req.State = "expired"
			req.ResponseNote = "这项照护已到时间，还没有人负责"
			expired = append(expired, req)
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	for _, req := range expired {
		title := fmt.Sprintf("%s 的照护请求已到期", req.PetName)
		body := requestBody(req, "已到期，当前仍没有负责人")
		s.notifyStatus(ctx, req.FromUserID, req.ID, req.FamilyID, req.PetID, title, body)
		if req.TargetUserID != req.FromUserID {
			s.notifyStatus(ctx, req.TargetUserID, req.ID, req.FamilyID, req.PetID, title, body)
		}
	}
	return len(expired), nil
}

// EscalateForFamily creates one actionable request for the earliest configured
// helper when the current occurrence owner is within 30 minutes of the due
// time. It intentionally does not assign the occurrence: only the helper's
// explicit acceptance can change the current owner.
func (s *Service) EscalateForFamily(ctx context.Context, familyID string, now time.Time) (int, error) {
	var escalated []Request
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		candidates, err := s.Repo.ListEscalationCandidates(ctx, tx, familyID, now)
		if err != nil {
			return err
		}
		for _, candidate := range candidates {
			occ, err := s.Repo.GetOccurrenceForUpdate(ctx, tx, candidate.OccurrenceID, familyID)
			if noRows(err) {
				continue
			}
			if err != nil {
				return err
			}
			if occ.AssignedToUserID == nil || *occ.AssignedToUserID != candidate.FromUserID || occ.DueAt == nil {
				continue
			}
			if !occ.DueAt.After(now) || occ.DueAt.After(now.Add(30*time.Minute)) {
				continue
			}
			open, err := s.Repo.OpenForOccurrence(ctx, tx, candidate.OccurrenceID)
			if err != nil {
				return err
			}
			if open {
				continue
			}
			ok, err := s.Repo.FamilyHasPetAndMembers(ctx, tx, familyID, candidate.PetID, candidate.FromUserID, candidate.TargetUserID)
			if err != nil {
				return err
			}
			if !ok {
				continue
			}
			message := "当前负责人还没完成，请你确认是否能做。"
			var supersedes *string
			latest, latestErr := s.Repo.LatestForOccurrence(ctx, tx, candidate.OccurrenceID)
			if latestErr == nil {
				supersedes = &latest.ID
			} else if !noRows(latestErr) {
				return latestErr
			}
			request, err := s.Repo.Insert(ctx, tx, Request{
				FamilyID: familyID, PetID: candidate.PetID, OccurrenceID: candidate.OccurrenceID,
				FromUserID: candidate.FromUserID, TargetUserID: candidate.TargetUserID, Message: message,
			}, supersedes)
			if err != nil {
				return mapConstraintError(err)
			}
			payload, _ := json.Marshal(map[string]any{"source": "auto_escalation", "message": message})
			if err := s.Repo.AddEvent(ctx, tx, request.ID, candidate.FromUserID, "sent", "", "sent", candidate.TargetUserID, payload); err != nil {
				return err
			}
			escalated = append(escalated, request)
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	for _, request := range escalated {
		s.notify(ctx, request.TargetUserID, request.ID, request.OccurrenceID, request.FamilyID, request.PetID,
			requestActionTitle(request), requestBody(request, "这项照护快到时间了，请确认是否能做"))
	}
	return len(escalated), nil
}

func (s *Service) notify(ctx context.Context, userID, requestID, occurrenceID, familyID, petID, title, body string) {
	if s.Notifier != nil {
		_ = s.Notifier.NotifyUserData(ctx, userID, title, body, "care_request", map[string]string{
			"kind":            "care_request",
			"care_request_id": requestID,
			"occurrence_id":   occurrenceID,
			"family_id":       familyID,
			"pet_id":          petID,
		})
	}
}

func (s *Service) notifyBatch(ctx context.Context, userID, batchID, familyID, title, body string) {
	if s.Notifier != nil {
		_ = s.Notifier.NotifyUserData(ctx, userID, title, body, "care_handoff_batch", map[string]string{
			"kind":          "care_handoff_batch",
			"care_batch_id": batchID,
			"family_id":     familyID,
		})
	}
}

func (s *Service) notifyBatchStatus(ctx context.Context, userID, batchID, familyID, title, body string) {
	if s.Notifier != nil {
		_ = s.Notifier.NotifyUserData(ctx, userID, title, body, "care_handoff_batch_status", map[string]string{
			"kind":          "care_handoff_batch_status",
			"care_batch_id": batchID,
			"family_id":     familyID,
		})
	}
}

// notifyStatus sends a receipt for a request that is no longer actionable.
// Keeping this separate from notify prevents prior participants from seeing
// action buttons that the API will correctly reject for them.
func (s *Service) notifyStatus(ctx context.Context, userID, requestID, familyID, petID, title, body string) {
	if s.Notifier != nil {
		_ = s.Notifier.NotifyUserData(ctx, userID, title, body, "care_handoff", map[string]string{
			"kind":            "care_handoff",
			"care_request_id": requestID,
			"family_id":       familyID,
			"pet_id":          petID,
		})
	}
}

func (s *Service) notifyHandoffParticipants(ctx context.Context, request Request, actorID string) {
	if s.Notifier == nil {
		return
	}
	participants, err := s.Repo.RequestParticipants(ctx, s.Pool, request.OccurrenceID)
	if err != nil {
		return
	}
	title := fmt.Sprintf("%s 的照护已转交", request.PetName)
	body := fmt.Sprintf("%s 已将「%s」转给 %s", request.FromUserName, request.OccurrenceTitle, request.TargetUserName)
	if request.Message != "" {
		body += " · " + request.Message
	}
	for _, userID := range participants {
		if userID == actorID || userID == request.TargetUserID {
			continue
		}
		s.notifyStatus(ctx, userID, request.ID, request.FamilyID, request.PetID, title, body)
	}
}

func requestBody(req Request, prefix string) string {
	body := prefix + "："
	if dueTime := requestDueTime(req); dueTime != "" {
		body += dueTime + " · "
	}
	// The pet is part of the responsibility, not optional context. Without it
	// a lock-screen card saying “喂药” is ambiguous as soon as a family has two
	// pets or two plans with the same title. Keep the legacy fallback for rows
	// created before pet metadata was hydrated.
	if req.PetName != "" {
		body += req.PetName + " · "
	}
	body += req.OccurrenceTitle
	if req.Message != "" {
		body += " · " + req.Message
	}
	return body
}

func requestActionBody(req Request) string {
	return requestBody(req, "请选一个处理方式") + " · 打开 PLANET 处理"
}

// requestResolutionBody keeps the resolved fact together: “who completed
// what” is the first thing a participant needs to understand. Action-card
// bodies put the due time before the title, but a completion/cancellation
// receipt must put the title immediately after the result sentence.
func requestResolutionBody(req Request, prefix string) string {
	body := prefix + "：" + req.OccurrenceTitle
	if dueTime := requestDueTime(req); dueTime != "" {
		body += " · " + dueTime
	}
	if req.Message != "" {
		body += " · " + req.Message
	}
	return body
}

// requestDueTime is the notification counterpart of the app's care-card
// formatter. due_at is an instant, so render it in the family's authoritative
// timezone; OccurrenceTime is only a civil-time fallback for legacy rows.
func requestDueTime(req Request) string {
	if req.DueAt != nil && req.FamilyTimezone != "" {
		if loc, err := time.LoadLocation(req.FamilyTimezone); err == nil {
			return req.DueAt.In(loc).Format("15:04")
		}
	}
	if req.OccurrenceTime != nil {
		return req.OccurrenceTime.Format("15:04")
	}
	return ""
}

func requestActionTitle(req Request) string {
	if req.FromUserName != "" {
		if req.OccurrenceTitle != "" {
			return fmt.Sprintf("%s 把「%s」交给你", req.FromUserName, req.OccurrenceTitle)
		}
		return fmt.Sprintf("%s 把这项照护交给你", req.FromUserName)
	}
	if req.OccurrenceTitle != "" {
		return fmt.Sprintf("请处理「%s」", req.OccurrenceTitle)
	}
	return fmt.Sprintf("%s 有一项照护需要处理", req.PetName)
}

func batchActionTitle(batch HandoffBatchView) string {
	if batch.FromUserName != "" {
		return fmt.Sprintf("%s 把 %d 项照护交给你", batch.FromUserName, batch.TotalCount)
	}
	return fmt.Sprintf("有 %d 项照护需要你处理", batch.TotalCount)
}

func mapConstraintError(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return httpx.NewAppError(409, "CARE_REQUEST_OPEN", "this care occurrence already has an open request")
	}
	return err
}
