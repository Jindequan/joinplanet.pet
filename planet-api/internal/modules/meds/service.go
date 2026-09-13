package meds

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/joinplanet/planet-api/internal/contracts"
	"github.com/joinplanet/planet-api/internal/platform/db"
	"github.com/joinplanet/planet-api/internal/platform/httpx"
)

type Service struct {
	Repo         *Repo
	Pool         *pgxpool.Pool
	Guard        contracts.PetsGuard
	Members      contracts.MembershipService
	Events       contracts.TimelineRecorder
	CareRequests contracts.CareRequestCloser
	Notifier     contracts.UserNotifier
}

const defaultMedicationTimezone = "Asia/Shanghai"

func medicationTimezone(ctx context.Context, pet contracts.Pet, familyID, userID string, members contracts.MembershipService) (string, error) {
	if familyID == "" && len(pet.FamilyIDs) == 1 {
		familyID = pet.FamilyIDs[0]
	}
	if len(pet.FamilyIDs) > 1 && familyID == "" {
		return "", httpx.ErrValidation("family_id is required when a pet belongs to multiple families")
	}
	if familyID == "" {
		return defaultMedicationTimezone, nil
	}
	belongs := false
	for _, candidate := range pet.FamilyIDs {
		if candidate == familyID {
			belongs = true
			break
		}
	}
	if !belongs {
		return "", httpx.ErrValidation("family_id does not belong to the pet")
	}
	if members == nil {
		return defaultMedicationTimezone, nil
	}
	if _, active, err := members.ActiveMember(ctx, familyID, userID); err != nil {
		return "", err
	} else if !active {
		return "", httpx.ErrNotFound("")
	}
	tz, err := members.FamilyTimezone(ctx, familyID)
	if err != nil {
		return "", err
	}
	if tz == "" {
		return defaultMedicationTimezone, nil
	}
	return tz, nil
}

func validate(name string) error {
	name = strings.TrimSpace(name)
	if name == "" || len(name) > 120 {
		return httpx.ErrValidation("name must be 1-120 chars")
	}
	return nil
}

// Create 建药 + 自动 timeline 事件 medication(started)（幂等）。
func (s *Service) Create(ctx context.Context, petID, userID, name, dose, schedule, note string) (Medication, error) {
	return s.CreateWithIdempotencyForFamily(ctx, petID, userID, name, dose, schedule, note, "", "")
}

func (s *Service) CreateWithIdempotency(ctx context.Context, petID, userID, name, dose, schedule, note, idempotencyKey string) (Medication, error) {
	return s.CreateWithIdempotencyForFamily(ctx, petID, userID, name, dose, schedule, note, "", idempotencyKey)
}

func (s *Service) CreateWithIdempotencyForFamily(ctx context.Context, petID, userID, name, dose, schedule, note, familyID, idempotencyKey string) (Medication, error) {
	name = strings.TrimSpace(name)
	if err := validate(name); err != nil {
		return Medication{}, err
	}
	if len(dose) > 120 || len(schedule) > 120 || len(note) > 2000 {
		return Medication{}, httpx.ErrValidation("dose/schedule/note too long")
	}
	var med Medication
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		pet, _, err := s.Guard.RequirePetRecordInTx(ctx, tx, petID, userID)
		if err != nil {
			return err
		}
		timezone, err := medicationTimezone(ctx, pet, familyID, userID, s.Members)
		if err != nil {
			return err
		}
		resolvedFamilyID := familyID
		if resolvedFamilyID == "" && len(pet.FamilyIDs) == 1 {
			resolvedFamilyID = pet.FamilyIDs[0]
		}
		loc, err := time.LoadLocation(timezone)
		if err != nil {
			return httpx.ErrValidation("family timezone invalid")
		}
		startedOn := time.Now().In(loc).Format("2006-01-02")
		scope := "medication:" + petID
		claim, err := db.ClaimIdempotency(ctx, tx, userID, scope, idempotencyKey,
			db.RequestHash(petID, familyID, name, dose, schedule, note))
		if err != nil {
			if errors.Is(err, db.ErrIdempotencyKeyReused) {
				return httpx.NewAppError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different request")
			}
			return err
		}
		if claim.Replay {
			med, err = s.Repo.Get(ctx, tx, claim.ResourceID)
			return err
		}
		med, err = s.Repo.Create(ctx, tx, petID, name, dose, schedule, note, userID, startedOn)
		if err != nil {
			return err
		}
		if err := db.BindIdempotency(ctx, tx, userID, scope, idempotencyKey, "medication", med.ID); err != nil {
			return err
		}
		payload, _ := json.Marshal(map[string]string{
			"medication_id": med.ID, "action": "started", "name": name,
			"dedupe": med.ID + ":started",
		})
		return s.Events.RecordAuto(ctx, tx, resolvedFamilyID, petID, "medication", time.Now().UTC(), userID, contracts.SourceAutoMed, payload)
	})
	return med, err
}

func (s *Service) List(ctx context.Context, petID, userID string) ([]Medication, error) {
	var meds []Medication
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		if _, _, err := s.Guard.RequirePetInTx(ctx, tx, petID, userID, false, false); err != nil {
			return err
		}
		var err error
		meds, err = s.Repo.ListByPet(ctx, tx, petID)
		return err
	})
	return meds, httpx.MapDBErr(err)
}

// ListForShare 供分享路径（无成员判定）。
func (s *Service) ListForShare(ctx context.Context, petID string) ([]contracts.SharedMed, error) {
	meds, err := s.Repo.ListByPet(ctx, s.Pool, petID)
	if err != nil {
		return nil, err
	}
	out := make([]contracts.SharedMed, len(meds))
	for i, m := range meds {
		out[i] = contracts.SharedMed{
			Name: m.Name, Dose: m.Dose, Schedule: m.Schedule,
			StartedOn: m.StartedOn, EndedOn: m.EndedOn,
		}
	}
	return out, nil
}

func (s *Service) Update(ctx context.Context, medID, userID string, name, dose, schedule, note *string) (Medication, error) {
	if name != nil {
		trimmed := strings.TrimSpace(*name)
		if err := validate(trimmed); err != nil {
			return Medication{}, err
		}
		*name = trimmed
	}
	if dose != nil && len(*dose) > 120 || schedule != nil && len(*schedule) > 120 || note != nil && len(*note) > 2000 {
		return Medication{}, httpx.ErrValidation("dose/schedule/note too long")
	}
	_, err := s.Repo.Get(ctx, s.Pool, medID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Medication{}, httpx.ErrNotFound("")
	}
	if err != nil {
		return Medication{}, err
	}
	var updated Medication
	err = db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		located, err := s.Repo.Get(ctx, tx, medID)
		if err != nil {
			return err
		}
		if _, _, err := s.Guard.RequirePetRecordInTx(ctx, tx, located.PetID, userID); err != nil {
			return err
		}
		if _, err := s.Repo.GetForUpdate(ctx, tx, medID); err != nil {
			return err
		}
		updated, err = s.Repo.Update(ctx, tx, medID, name, dose, schedule, note)
		return err
	})
	return updated, httpx.MapDBErr(err)
}

// Stop 停药：写 ended_on + 自动 medication(ended) 事件；重复停药幂等（不再写事件）。
func (s *Service) Stop(ctx context.Context, medID, userID string, endedOn *time.Time) (Medication, error) {
	return s.StopForFamily(ctx, medID, userID, endedOn, "")
}

func (s *Service) StopForFamily(ctx context.Context, medID, userID string, endedOn *time.Time, familyID string) (Medication, error) {
	return s.StopForFamilyWithIdempotency(ctx, medID, userID, endedOn, familyID, "")
}

func (s *Service) StopForFamilyWithIdempotency(ctx context.Context, medID, userID string, endedOn *time.Time, familyID, idempotencyKey string) (Medication, error) {
	med, err := s.Repo.Get(ctx, s.Pool, medID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Medication{}, httpx.ErrNotFound("")
	}
	if err != nil {
		return Medication{}, err
	}
	pet, _, err := s.Guard.RequirePetInTx(ctx, s.Pool, med.PetID, userID, false, true)
	if err != nil {
		return Medication{}, err
	}
	timezone, err := medicationTimezone(ctx, pet, familyID, userID, s.Members)
	if err != nil {
		return Medication{}, err
	}
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		return Medication{}, httpx.ErrValidation("family timezone invalid")
	}
	resolvedFamilyID := familyID
	if resolvedFamilyID == "" && len(pet.FamilyIDs) == 1 {
		resolvedFamilyID = pet.FamilyIDs[0]
	}
	endDate := time.Now().In(loc).Format("2006-01-02")
	endEventAt := time.Now().UTC()
	if endedOn != nil {
		// started_on/ended_on are civil DATE values. Comparing timestamps here
		// made the result depend on the server timezone and allowed tomorrow
		// during the first 24 hours of the day.
		endDate = endedOn.Format("2006-01-02")
		if endDate < med.StartedOn.Format("2006-01-02") {
			return Medication{}, httpx.ErrValidation("ended_on cannot precede started_on")
		}
		if endDate > time.Now().In(loc).Format("2006-01-02") {
			return Medication{}, httpx.ErrValidation("ended_on cannot be in the future")
		}
		dateParts := strings.Split(endDate, "-")
		if len(dateParts) == 3 {
			if parsed, parseErr := time.ParseInLocation("2006-01-02", endDate, loc); parseErr == nil {
				endEventAt = parsed.Add(12 * time.Hour).UTC()
			}
		}
	} else if endDate < med.StartedOn.Format("2006-01-02") {
		endDate = med.StartedOn.Format("2006-01-02")
	}
	var cancellationNotices []contracts.CareRequestCancellationNotice
	err = db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		located, err := s.Repo.Get(ctx, tx, medID)
		if err != nil {
			return err
		}
		if _, _, err := s.Guard.RequirePetRecordInTx(ctx, tx, located.PetID, userID); err != nil {
			return err
		}
		locked, err := s.Repo.GetForUpdate(ctx, tx, medID)
		if err != nil {
			return err
		}
		// Hash the caller's intent rather than the server-resolved default date;
		// a retry after midnight must replay the original request instead of
		// becoming a different command.
		endDateHash := ""
		if endedOn != nil {
			endDateHash = endedOn.Format("2006-01-02")
		}
		claim, err := db.ClaimIdempotency(ctx, tx, userID, "medication-stop:"+medID, idempotencyKey, db.RequestHash(endDateHash, familyID))
		if errors.Is(err, db.ErrIdempotencyKeyReused) {
			return httpx.NewAppError(http.StatusConflict, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different request")
		}
		if err != nil {
			return err
		}
		if locked.EndedOn != nil {
			med = locked
			if claim.Replay {
				return nil
			}
			return db.BindIdempotency(ctx, tx, userID, "medication-stop:"+medID, idempotencyKey, "medication", medID)
		}
		if claim.Replay {
			med = locked
			return nil
		}
		updated, newlyStopped, err := s.Repo.StopMedication(ctx, tx, medID, endDate)
		if err != nil {
			return err
		}
		med = updated
		if !newlyStopped {
			return nil // 并发竞争：另一请求先停了
		}
		// 停药联动：归档挂在该用药上的活跃照护计划并取消其未完成项，
		// 否则"喂药"任务会在停药后继续每天生成、继续提醒。
		occurrenceIDs, err := cancelMedicationOpenOccurrences(ctx, tx, medID)
		if err != nil {
			return err
		}
		if err := s.closeCareRequests(ctx, tx, occurrenceIDs, userID, "用药已结束", &cancellationNotices); err != nil {
			return err
		}
		payload, _ := json.Marshal(map[string]string{
			"medication_id": medID, "action": "ended", "name": med.Name,
			"dedupe": medID + ":ended",
		})
		if err := s.Events.RecordAuto(ctx, tx, resolvedFamilyID, med.PetID, "medication", endEventAt, userID, contracts.SourceAutoMed, payload); err != nil {
			return err
		}
		return db.BindIdempotency(ctx, tx, userID, "medication-stop:"+medID, idempotencyKey, "medication", medID)
	})
	if err == nil {
		s.notifyCareRequestCancellations(ctx, cancellationNotices)
	}
	return med, err
}

// Delete 仅 owner；auto 事件随宠物级联/保留策略在 B8 处理，这里只删药与关联事件。
func (s *Service) Delete(ctx context.Context, medID, userID string) error {
	_, err := s.Repo.Get(ctx, s.Pool, medID)
	if errors.Is(err, pgx.ErrNoRows) {
		return httpx.ErrNotFound("")
	}
	if err != nil {
		return err
	}
	var cancellationNotices []contracts.CareRequestCancellationNotice
	err = db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		located, err := s.Repo.Get(ctx, tx, medID)
		if err != nil {
			return err
		}
		if _, _, err := s.Guard.RequirePetInTx(ctx, tx, located.PetID, userID, true, true); err != nil {
			return err
		}
		locked, err := s.Repo.GetForUpdate(ctx, tx, medID)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			UPDATE pet_events SET deleted_at=now()
			WHERE pet_id = $1 AND source = $2 AND payload->>'medication_id' = $3 AND deleted_at IS NULL`,
			locked.PetID, contracts.SourceAutoMed, medID); err != nil {
			return err
		}
		// 删药联动：与停药同样归档挂载的活跃计划并取消未完成项。
		occurrenceIDs, err := cancelMedicationOpenOccurrences(ctx, tx, medID)
		if err != nil {
			return err
		}
		if err := s.closeCareRequests(ctx, tx, occurrenceIDs, userID, "用药已删除", &cancellationNotices); err != nil {
			return err
		}
		return s.Repo.Delete(ctx, tx, medID)
	})
	if err == nil {
		s.notifyCareRequestCancellations(ctx, cancellationNotices)
	}
	return httpx.MapDBErr(err)
}

func cancelMedicationOpenOccurrences(ctx context.Context, tx pgx.Tx, medicationID string) ([]string, error) {
	rows, err := tx.Query(ctx, `
		WITH linked AS (
			UPDATE care_plans SET status='archived', updated_at=now()
			WHERE medication_id=$1 AND status='active' AND deleted_at IS NULL
			RETURNING id
		)
		UPDATE care_occurrences co SET status='cancelled', updated_at=now()
		FROM linked l
		WHERE co.care_plan_id=l.id AND co.status IN('pending','missed') AND co.deleted_at IS NULL
		RETURNING co.id`, medicationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (s *Service) closeCareRequests(ctx context.Context, tx pgx.Tx, occurrenceIDs []string, userID, reason string, notices *[]contracts.CareRequestCancellationNotice) error {
	if s.CareRequests == nil {
		return nil
	}
	for _, occurrenceID := range occurrenceIDs {
		canceled, err := s.CareRequests.CancelOpenForOccurrence(ctx, tx, occurrenceID, userID, reason)
		if err != nil {
			return err
		}
		*notices = append(*notices, canceled...)
	}
	return nil
}

func (s *Service) notifyCareRequestCancellations(ctx context.Context, notices []contracts.CareRequestCancellationNotice) {
	if s.Notifier == nil {
		return
	}
	for _, notice := range notices {
		_ = s.Notifier.NotifyUserData(ctx, notice.UserID,
			notice.PetName+" 的照护请求已结束", notice.Body, "care_handoff", map[string]string{
				"kind": "care_handoff", "care_request_id": notice.RequestID,
				"family_id": notice.FamilyID, "pet_id": notice.PetID,
			})
	}
}
