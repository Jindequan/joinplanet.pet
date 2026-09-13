package timeline

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/joinplanet/planet-api/internal/contracts"
	"github.com/joinplanet/planet-api/internal/platform/db"
	"github.com/joinplanet/planet-api/internal/platform/httpx"
)

func jsonUnmarshal(p []byte, v any) error { return json.Unmarshal(p, v) }

type Service struct {
	Repo           *Repo
	Pool           *pgxpool.Pool
	Guard          contracts.PetsGuard
	Weight         contracts.PetWeightSetter
	Members        contracts.MembershipService
	AccessiblePets func(context.Context, string) ([]contracts.Pet, error)
}

var _ contracts.TimelineRecorder = (*Service)(nil)

// RecordAuto 供 meds/transfers/tasks 等模块写自动事件（同事务内调用）。
// payload 的 "dedupe" 字段做幂等：已存在同 dedupe 的事件则跳过。
func (s *Service) RecordAuto(ctx context.Context, q db.Q, familyID, petID, eventType string, occurredAt time.Time, byUserID, source string, payload []byte) error {
	if !AutoTypes[eventType] {
		return errors.New("timeline: type not allowed for auto events: " + eventType)
	}
	if err := ValidatePayload(eventType, payload); err != nil {
		return err
	}
	extract := map[string]any{}
	_ = jsonUnmarshal(payload, &extract)
	dedupe, _ := extract["dedupe"].(string)
	if dedupe == "" {
		return errors.New(`timeline: auto payload requires "dedupe" field`)
	}
	careOccurrenceID, _ := extract["care_task_id"].(string)
	return s.Repo.InsertAuto(ctx, q, Event{
		PetID: petID, FamilyID: familyID, CareOccurrenceID: careOccurrenceID, Type: eventType, OccurredAt: occurredAt,
		RecordedBy: byUserID, Source: source, Payload: payload, DedupeKey: dedupe,
	})
}

// Create 用户手动记录事件。
func (s *Service) Create(ctx context.Context, petID, userID, eventType string, occurredAt time.Time, payload []byte) (Event, error) {
	return s.CreateWithFamilyAndIdempotency(ctx, petID, userID, "", eventType, occurredAt, payload, "")
}

func (s *Service) CreateWithIdempotency(ctx context.Context, petID, userID, eventType string, occurredAt time.Time, payload []byte, idempotencyKey string) (Event, error) {
	return s.CreateWithFamilyAndIdempotency(ctx, petID, userID, "", eventType, occurredAt, payload, idempotencyKey)
}

// CreateWithFamilyAndIdempotency writes a manual event with the active Family
// edge. The old method remains as a compatibility wrapper for internal tools.
func (s *Service) CreateWithFamilyAndIdempotency(ctx context.Context, petID, userID, familyID, eventType string, occurredAt time.Time, payload []byte, idempotencyKey string) (Event, error) {
	if !ValidType(eventType) {
		return Event{}, httpx.ErrValidation("unknown event type: " + eventType)
	}
	if err := ValidatePayload(eventType, payload); err != nil {
		return Event{}, err
	}
	if occurredAt.After(time.Now().UTC()) {
		return Event{}, httpx.ErrValidation("occurred_at cannot be in the future")
	}
	var e Event
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		pet, _, err := s.Guard.RequirePetInTx(ctx, tx, petID, userID, false, true)
		if err != nil {
			return err
		}
		familyID = strings.TrimSpace(familyID)
		if familyID == "" && len(pet.FamilyIDs) == 1 {
			familyID = pet.FamilyIDs[0]
		}
		if len(pet.FamilyIDs) > 1 && familyID == "" {
			return httpx.ErrValidation("family_id is required when a pet belongs to multiple families")
		}
		if familyID != "" {
			if !contains(pet.FamilyIDs, familyID) {
				return httpx.ErrValidation("family_id does not belong to the pet")
			}
			if s.Members != nil {
				if _, active, err := s.Members.ActiveMember(ctx, familyID, userID); err != nil {
					return err
				} else if !active {
					return httpx.ErrNotFound("")
				}
			}
		}
		scope := "timeline:" + petID
		claim, err := db.ClaimIdempotency(ctx, tx, userID, scope, idempotencyKey,
			db.RequestHash(petID, familyID, eventType, occurredAt.UTC().Format(time.RFC3339Nano), string(payload)))
		if err != nil {
			if errors.Is(err, db.ErrIdempotencyKeyReused) {
				return httpx.NewAppError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different request")
			}
			return err
		}
		if claim.Replay {
			e, err = s.Repo.Get(ctx, tx, claim.ResourceID)
			return err
		}
		e, err = s.Repo.Insert(ctx, tx, Event{
			PetID: pet.ID, FamilyID: familyID, Type: eventType, OccurredAt: occurredAt,
			RecordedBy: userID, Source: SourceUser, Payload: payload,
		})
		if err == nil {
			err = db.BindIdempotency(ctx, tx, userID, scope, idempotencyKey, "timeline_event", e.ID)
		}
		// weight 是事件账本；冗余字段必须由最新事件重建，不能让一条
		// 旧的补记记录覆盖当前体重。
		if err == nil && eventType == "weight" && s.Weight != nil {
			err = s.Weight.RecalculateWeight(ctx, tx, pet.ID)
		}
		return err
	})
	return e, err
}

// RecordHandoffNote writes a user note for L3 handoff (same transaction as duty change).
func (s *Service) RecordHandoffNote(ctx context.Context, q db.Q, petID, userID, text string) error {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}
	payload, err := json.Marshal(map[string]string{"text": text, "kind": "handoff"})
	if err != nil {
		return err
	}
	if err := ValidatePayload("note", payload); err != nil {
		return err
	}
	_, err = s.Repo.Insert(ctx, q, Event{
		PetID: petID, Type: "note", OccurredAt: time.Now().UTC(),
		RecordedBy: userID, Source: SourceUser, Payload: payload,
	})
	return err
}

func weightFromPayload(p []byte) int {
	var s struct {
		WeightG int `json:"weight_g"`
	}
	_ = jsonUnmarshal(p, &s)
	return s.WeightG
}

// weightFromPayloadOK：区分"未提供"与"显式 0"，编辑时仅当携带 weight_g 才回写。
func weightFromPayloadOK(p []byte) (int, bool) {
	var s struct {
		WeightG *int `json:"weight_g"`
	}
	if err := jsonUnmarshal(p, &s); err != nil || s.WeightG == nil {
		return 0, false
	}
	return *s.WeightG, true
}

func (s *Service) List(ctx context.Context, petID, userID string, before *time.Time, beforeID *string, limit int) ([]Event, error) {
	var events []Event
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		if _, _, err := s.Guard.RequirePetInTx(ctx, tx, petID, userID, false, false); err != nil {
			return err
		}
		var err error
		events, err = s.Repo.ListByPet(ctx, tx, petID, before, beforeID, limit)
		return err
	})
	return events, httpx.MapDBErr(err)
}

// ListAggregate returns a single cursor-ordered stream for All or Family
// scope. Pet access is discovered through the canonical pets service and the
// Family membership is checked before filtering links.
func (s *Service) ListAggregate(ctx context.Context, userID, familyID, petID string, before *time.Time, beforeID *string, limit int) ([]Event, *Event, error) {
	if petID != "" {
		events, err := s.List(ctx, petID, userID, before, beforeID, limit)
		if err != nil {
			return nil, nil, err
		}
		return events, lastEvent(events), nil
	}
	if s.AccessiblePets == nil {
		return nil, nil, httpx.NewAppError(500, "TIMELINE_AGGREGATE_UNAVAILABLE", "aggregate timeline is not configured")
	}
	if familyID != "" && s.Members != nil {
		if _, ok, err := s.Members.ActiveMember(ctx, familyID, userID); err != nil {
			return nil, nil, err
		} else if !ok {
			return nil, nil, httpx.ErrNotFound("")
		}
	}
	accessible, err := s.AccessiblePets(ctx, userID)
	if err != nil {
		return nil, nil, err
	}
	petIDs := make([]string, 0, len(accessible))
	for _, pet := range accessible {
		if familyID == "" || contains(pet.FamilyIDs, familyID) {
			petIDs = append(petIDs, pet.ID)
		}
	}
	var events []Event
	err = db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		var err error
		events, err = s.Repo.ListByPets(ctx, tx, petIDs, before, beforeID, limit)
		return err
	})
	return events, lastEvent(events), httpx.MapDBErr(err)
}

func contains(values []string, wanted string) bool {
	for _, value := range values {
		if value == wanted {
			return true
		}
	}
	return false
}

func lastEvent(events []Event) *Event {
	if len(events) == 0 {
		return nil
	}
	last := events[len(events)-1]
	return &last
}

// authorizeMutation keeps a shared Pet's event provenance meaningful. The
// ordinary Pet guard answers whether the caller may access the Pet; this
// second check answers whether they may mutate this event's Family record.
func (s *Service) authorizeMutation(ctx context.Context, q db.Q, e Event, pet contracts.Pet, member contracts.Member, userID string) error {
	if pet.CurrentOwnerUserID == userID || e.RecordedBy == userID {
		return nil
	}
	if e.FamilyID == "" {
		if member.Role == contracts.RoleOwner {
			return nil
		}
		return httpx.ErrRoleForbidden()
	}
	role, err := s.Repo.ActiveFamilyPetMemberRole(ctx, q, e.FamilyID, e.PetID, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return httpx.ErrRoleForbidden()
	}
	if err != nil {
		return err
	}
	if role != string(contracts.RoleOwner) {
		return httpx.ErrRoleForbidden()
	}
	return nil
}

// ListForShare 供分享路径（无成员判定；取最近 sinceDays 天内事件，上限 limit）。
func (s *Service) ListForShare(ctx context.Context, petID string, sinceDays, limit int) ([]contracts.SharedEvent, error) {
	events, err := s.Repo.ListByPet(ctx, s.Pool, petID, nil, nil, limit)
	if err != nil {
		return nil, err
	}
	cutoff := time.Now().UTC().AddDate(0, 0, -sinceDays)
	out := []contracts.SharedEvent{}
	for _, e := range events {
		if e.OccurredAt.Before(cutoff) {
			break // ListByPet 按时间倒序，遇到窗口外即停
		}
		out = append(out, contracts.SharedEvent{
			Type: e.Type, OccurredAt: e.OccurredAt,
			Source: e.Source, Payload: json.RawMessage(e.Payload),
		})
	}
	return out, nil
}

// Update：记录者本人或圈主；auto 事件不可改。
func (s *Service) Update(ctx context.Context, eventID, userID string, occurredAt time.Time, payload []byte) (Event, error) {
	if occurredAt.After(time.Now().UTC()) {
		return Event{}, httpx.ErrValidation("occurred_at cannot be in the future")
	}
	var e Event
	var updated Event
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		var err error
		e, err = s.Repo.Get(ctx, tx, eventID)
		if err != nil {
			return err
		}
		pet, member, err := s.Guard.RequirePetInTx(ctx, tx, e.PetID, userID, false, false)
		if err != nil {
			return err
		}
		if pet.Archived() {
			return httpx.ErrArchived()
		}
		if member.Role == contracts.RoleViewer || member.Role == contracts.RoleReadOnly {
			return httpx.ErrRoleForbidden()
		}
		if err := s.authorizeMutation(ctx, tx, e, pet, member, userID); err != nil {
			return err
		}
		if e.Source != SourceUser {
			return httpx.NewAppError(409, "AUTO_EVENT_IMMUTABLE", "auto events cannot be edited")
		}
		if err := ValidatePayload(e.Type, payload); err != nil {
			return err
		}
		e, err = s.Repo.GetForUpdate(ctx, tx, eventID)
		if err != nil {
			return err
		}
		updated, err = s.Repo.Update(ctx, tx, eventID, occurredAt, payload)
		if err != nil {
			return err
		}
		if e.Type == "weight" && s.Weight != nil {
			if err := s.Weight.RecalculateWeight(ctx, tx, e.PetID); err != nil {
				return err
			}
		}
		return nil
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return Event{}, httpx.ErrNotFound("")
	}
	return updated, err
}

// Delete：记录者本人或圈主；auto 事件不可删（历史事实）。
func (s *Service) Delete(ctx context.Context, eventID, userID string) error {
	var e Event
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		var err error
		e, err = s.Repo.Get(ctx, tx, eventID)
		if err != nil {
			return err
		}
		pet, member, err := s.Guard.RequirePetInTx(ctx, tx, e.PetID, userID, false, false)
		if err != nil {
			return err
		}
		if pet.Archived() {
			return httpx.ErrArchived()
		}
		if member.Role == contracts.RoleViewer || member.Role == contracts.RoleReadOnly {
			return httpx.ErrRoleForbidden()
		}
		if err := s.authorizeMutation(ctx, tx, e, pet, member, userID); err != nil {
			return err
		}
		e, err = s.Repo.GetForUpdate(ctx, tx, eventID)
		if err != nil {
			return err
		}
		if err := s.Repo.Delete(ctx, tx, eventID); err != nil {
			return err
		}
		if e.Type == "weight" && s.Weight != nil {
			return s.Weight.RecalculateWeight(ctx, tx, e.PetID)
		}
		return nil
	})
	if errors.Is(err, errAutoImmutable) {
		return httpx.NewAppError(409, "AUTO_EVENT_IMMUTABLE", "auto events cannot be deleted")
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return httpx.ErrNotFound("")
	}
	return err
}
