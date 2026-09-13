package sharing

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/joinplanet/planet-api/internal/contracts"
	platformaudit "github.com/joinplanet/planet-api/internal/platform/audit"
	"github.com/joinplanet/planet-api/internal/platform/clockx"
	"github.com/joinplanet/planet-api/internal/platform/db"
	"github.com/joinplanet/planet-api/internal/platform/httpx"
)

const (
	KindCareCard = "care_card"
	KindSummary  = "summary"
)

// 24h 起步，最长「永久」=100 年（876000h）。数值同时是产品可选档位。
var validTTL = map[int]bool{24: true, 72: true, 168: true, 720: true, 2160: true, 8760: true, 876000: true}

type Service struct {
	Repo    *Repo
	Pool    *pgxpool.Pool
	Guard   contracts.PetsGuard
	Pets    contracts.PetReader
	Meds    contracts.MedsReader
	Events  contracts.EventReader
	Today   contracts.TodayReader
	Members contracts.MembershipService
	Clock   clockx.Clock
}

func shareAuditMetadata(pet contracts.Pet, shareID, kind string) map[string]any {
	metadata := map[string]any{
		"share_id": shareID,
		"kind":     kind,
	}
	familyIDs := append([]string(nil), pet.FamilyIDs...)
	if len(familyIDs) > 0 {
		metadata["family_ids"] = familyIDs
		familyID := pet.PrimaryFamilyID
		if familyID == "" {
			familyID = familyIDs[0]
		}
		metadata["family_id"] = familyID
	}
	return metadata
}

func hashToken(t string) string {
	sum := sha256.Sum256([]byte(t))
	return hex.EncodeToString(sum[:])
}

// summaryOptions：Summary 的段落选择（v1：profile/medications/events + 时间窗）。
type summaryOptions struct {
	Sections      []string `json:"sections"`
	Days          int      `json:"days"`
	IncludePhotos bool     `json:"include_photos"`
}

func parseSummaryOptions(raw []byte) (summaryOptions, error) {
	var o summaryOptions
	if len(raw) == 0 {
		o.Sections = []string{"profile", "medications", "events"}
		o.Days = 90
		return o, nil
	}
	if err := json.Unmarshal(raw, &o); err != nil {
		return o, httpx.ErrValidation("invalid options")
	}
	if len(o.Sections) == 0 {
		o.Sections = []string{"profile", "medications", "events"}
	}
	if o.Days <= 0 {
		o.Days = 90
	}
	if o.Days > 365 {
		return o, httpx.ErrValidation("options.days max 365")
	}
	valid := map[string]bool{"profile": true, "medications": true, "events": true}
	for _, s := range o.Sections {
		if !valid[s] {
			return o, httpx.ErrValidation("unknown section: " + s)
		}
	}
	return o, nil
}

// Create 生成分享（仅 Owner；归档宠不可新增分享）。token 明文仅返回一次。
func (s *Service) Create(ctx context.Context, petID, userID, kind string, ttlHours int, options json.RawMessage) (ShareLink, string, error) {
	return s.CreateWithIdempotency(ctx, petID, userID, kind, ttlHours, options, "")
}

func (s *Service) CreateWithIdempotency(ctx context.Context, petID, userID, kind string, ttlHours int, options json.RawMessage, idempotencyKey string) (ShareLink, string, error) {
	if kind != KindCareCard && kind != KindSummary {
		return ShareLink{}, "", httpx.ErrValidation("kind must be care_card|summary")
	}
	if !validTTL[ttlHours] {
		return ShareLink{}, "", httpx.ErrValidation("ttl_hours must be 24|72|168|720|2160|8760|876000")
	}
	if kind == KindSummary {
		if _, err := parseSummaryOptions(options); err != nil {
			return ShareLink{}, "", err
		}
	}
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return ShareLink{}, "", httpx.ErrInternal("could not create secure share token")
	}
	token := base64.RawURLEncoding.EncodeToString(b)
	opts := options
	if len(opts) == 0 {
		opts = json.RawMessage("{}")
	}
	// Materialize the public view before creating the credential. A share is a
	// handoff snapshot: later edits, medication changes, and timeline entries
	// must not silently change what the recipient was shown.
	if _, _, err := s.Guard.RequirePet(ctx, petID, true, false); err != nil {
		return ShareLink{}, "", err
	}
	var snapshotData any
	var err error
	if kind == KindCareCard {
		snapshotData, err = s.buildCareCard(ctx, ShareLink{PetID: petID, Kind: kind})
	} else {
		snapshotData, err = s.buildSummary(ctx, ShareLink{PetID: petID, Kind: kind, Options: opts})
	}
	if err != nil {
		return ShareLink{}, "", err
	}
	snapshot, err := json.Marshal(snapshotData)
	if err != nil {
		return ShareLink{}, "", httpx.ErrInternal("could not snapshot share")
	}
	var share ShareLink
	err = db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		pet, _, err := s.Guard.RequirePetInTx(ctx, tx, petID, userID, true, true)
		if err != nil {
			return err
		}
		scope := "share:" + petID
		claim, err := db.ClaimIdempotency(ctx, tx, userID, scope, idempotencyKey,
			db.RequestHash(petID, kind, fmt.Sprintf("%d", ttlHours), string(opts)))
		if err != nil {
			if errors.Is(err, db.ErrIdempotencyKeyReused) {
				return httpx.NewAppError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different request")
			}
			return err
		}
		if claim.Replay {
			share, err = s.Repo.ByIDForUpdate(ctx, tx, claim.ResourceID)
			if err != nil {
				return err
			}
			var replay struct {
				Token string `json:"token"`
			}
			if err := json.Unmarshal(claim.ResponseBody, &replay); err != nil || replay.Token == "" || hashToken(replay.Token) != share.TokenHash {
				// This can only happen for an idempotency row written by an older
				// server, or for corrupted response metadata. Never rotate a live
				// credential during a retry: doing so invalidates a link already
				// delivered to the caller.
				return httpx.NewAppError(409, "IDEMPOTENCY_REPLAY_SECRET_UNAVAILABLE", "the original share token is not recoverable")
			}
			token = replay.Token
			return nil
		}
		share, err = s.Repo.Insert(ctx, tx, ShareLink{
			PetID: pet.ID, Kind: kind, TokenHash: hashToken(token),
			Options: opts, Snapshot: snapshot, CreatedByUserID: userID,
			ExpiresAt: s.Clock.Now().Add(time.Duration(ttlHours) * time.Hour),
		})
		if err == nil {
			if err = platformaudit.Record(ctx, tx, userID, "share_created", "pet", pet.ID, shareAuditMetadata(pet, share.ID, kind)); err != nil {
				return err
			}
			response, marshalErr := json.Marshal(map[string]string{"token": token})
			if marshalErr != nil {
				return marshalErr
			}
			err = db.BindIdempotencyWithResponse(ctx, tx, userID, scope, idempotencyKey, "share_link", share.ID, response)
		}
		return err
	})
	if err != nil {
		return ShareLink{}, "", err
	}
	return share, token, nil
}

func (s *Service) List(ctx context.Context, petID, userID string) ([]ShareLink, error) {
	var shares []ShareLink
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		if _, _, err := s.Guard.RequirePetInTx(ctx, tx, petID, userID, true, false); err != nil {
			return err
		}
		var err error
		shares, err = s.Repo.ListByPet(ctx, tx, petID)
		return err
	})
	return shares, httpx.MapDBErr(err)
}

// Revoke 撤销（Owner）；查询时即刻失效（决策 D5）。
func (s *Service) Revoke(ctx context.Context, shareID, userID string) error {
	_, err := s.Repo.ByID(ctx, s.Pool, shareID)
	if errors.Is(err, pgx.ErrNoRows) {
		return httpx.ErrNotFound("")
	}
	if err != nil {
		return err
	}
	err = db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		located, err := s.Repo.ByID(ctx, tx, shareID)
		if err != nil {
			return err
		}
		pet, _, err := s.Guard.RequirePetInTx(ctx, tx, located.PetID, userID, true, false)
		if err != nil {
			return err
		}
		if _, err := s.Repo.ByIDForUpdate(ctx, tx, shareID); err != nil {
			return err
		}
		if err := s.Repo.Revoke(ctx, tx, shareID); err != nil {
			return err
		}
		return platformaudit.Record(ctx, tx, userID, "share_revoked", "pet", pet.ID, shareAuditMetadata(pet, shareID, located.Kind))
	})
	if errors.Is(err, errAlreadyRevoked) {
		return nil // 幂等
	}
	return httpx.MapDBErr(err)
}

// RevokeForPet 用于 Pet 转移等生命周期操作；调用方负责在同一事务内完成。
func (s *Service) RevokeForPet(ctx context.Context, q contracts.Q, petID string) error {
	return s.Repo.RevokeAllForPet(ctx, q, petID)
}

// ViewResult：匿名接收方拿到的完整视图。
type ViewResult struct {
	Kind      string    `json:"kind"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
	Data      any       `json:"data"`
}

// ViewByToken 公开访问入口：过期/撤销/不存在一律 410 SHARE_GONE（不泄露）。
func (s *Service) ViewByToken(ctx context.Context, token string) (ViewResult, error) {
	if token == "" || len(token) > 128 {
		return ViewResult{}, httpx.NewAppError(410, "SHARE_GONE", "share not available")
	}
	share, err := s.Repo.ByTokenHash(ctx, s.Pool, hashToken(token))
	if errors.Is(err, pgx.ErrNoRows) {
		return ViewResult{}, httpx.NewAppError(410, "SHARE_GONE", "share not available")
	}
	if err != nil {
		return ViewResult{}, err
	}
	now := s.Clock.Now()
	if share.RevokedAt != nil || !share.ExpiresAt.After(now) {
		return ViewResult{}, httpx.NewAppError(410, "SHARE_GONE", "share not available")
	}

	var data any
	if len(share.Snapshot) > 0 && string(share.Snapshot) != "{}" {
		if err := json.Unmarshal(share.Snapshot, &data); err != nil {
			return ViewResult{}, httpx.NewAppError(410, "SHARE_GONE", "share not available")
		}
	} else {
		switch share.Kind {
		case KindCareCard:
			data, err = s.buildCareCard(ctx, share)
		case KindSummary:
			data, err = s.buildSummary(ctx, share)
		default:
			return ViewResult{}, httpx.NewAppError(410, "SHARE_GONE", "share not available")
		}
	}
	if err != nil {
		return ViewResult{}, err
	}
	if err := s.Repo.TouchView(ctx, s.Pool, share.ID); err != nil {
		// 计数失败不阻断查看（冗余计数，容忍丢失）
		_ = err
	}
	return ViewResult{Kind: share.Kind, ExpiresAt: share.ExpiresAt, CreatedAt: share.CreatedAt, Data: data}, nil
}

// buildCareCard：临时照护最小集 —— 今日任务 + 紧急联系人 + 医疗决定人。
// 绝不含：过敏/慢病（属病史）/时间线/已结束用药历史。
func (s *Service) buildCareCard(ctx context.Context, share ShareLink) (map[string]any, error) {
	pet, profile, err := s.Pets.GetForShare(ctx, share.PetID)
	if err != nil {
		return nil, err
	}
	now := s.Clock.Now()
	groups, err := s.Today.TodayForPetShare(ctx, pet.ID, now)
	if err != nil {
		return nil, err
	}
	// 只保留该宠物自己的任务组
	items := []contracts.SharedTodayItem{}
	for _, g := range groups {
		if g.PetID == pet.ID {
			items = g.Items
		}
	}
	// A care card is a Pet-level share. Prefer the owning Family's civil-day
	// timezone, then fall back to the occurrence snapshot. The old code used
	// an empty TaskReader timezone and silently fell back to Shanghai even when
	// the Family was in another region.
	tzName := ""
	for _, group := range groups {
		if tzName == "" && group.PetID == pet.ID && group.Timezone != "" {
			tzName = group.Timezone
		}
	}
	// Legacy readers may not return the resolved timezone. In that case use
	// the pet's primary edge before any other family link; array order is not
	// a product decision and can differ from the household that owns the pet.
	if tzName == "" && s.Members != nil {
		familyIDs := make([]string, 0, len(pet.FamilyIDs)+1)
		if pet.PrimaryFamilyID != "" {
			familyIDs = append(familyIDs, pet.PrimaryFamilyID)
		}
		for _, familyID := range pet.FamilyIDs {
			if familyID != pet.PrimaryFamilyID {
				familyIDs = append(familyIDs, familyID)
			}
		}
		for _, familyID := range familyIDs {
			familyTZ, tzErr := s.Members.FamilyTimezone(ctx, familyID)
			if tzErr == nil && familyTZ != "" {
				tzName = familyTZ
				break
			}
		}
	}
	if tzName == "" {
		tzName = "Asia/Shanghai"
	}
	// A Pet is not owned by a Family. If there are no task snapshots, use the
	// stable app default rather than inventing a primary Family.
	tz, terr := time.LoadLocation(tzName)
	if terr != nil {
		tz = time.UTC
	}
	todayStr := s.Clock.Now().In(tz).Format("2006-01-02")
	return map[string]any{
		"pet":                petBasic(pet),
		"date":               todayStr,
		"tasks":              items,
		"emergency_contacts": rawOr(profile.EmergencyContacts, []any{}),
		"med_decision_maker": rawOr(profile.MedDecisionMaker, nil),
	}, nil
}

// buildSummary：就诊摘要 —— Owner 勾选的段落（档案含过敏/慢病、用药、时间窗内事件）。
func (s *Service) buildSummary(ctx context.Context, share ShareLink) (map[string]any, error) {
	opts, err := parseSummaryOptions(share.Options)
	if err != nil {
		return nil, err
	}
	pet, profile, err := s.Pets.GetForShare(ctx, share.PetID)
	if err != nil {
		return nil, err
	}
	data := map[string]any{"pet": petBasic(pet)}
	wants := map[string]bool{}
	for _, sec := range opts.Sections {
		wants[sec] = true
	}
	if wants["profile"] {
		data["allergies"] = rawOr(profile.Allergies, []any{})
		data["conditions"] = rawOr(profile.Conditions, []any{})
		data["notes"] = profile.Notes
	}
	if wants["medications"] {
		meds, err := s.Meds.ListForShare(ctx, share.PetID)
		if err != nil {
			return nil, err
		}
		data["medications"] = meds
	}
	if wants["events"] {
		events, err := s.Events.ListForShare(ctx, share.PetID, opts.Days, 200)
		if err != nil {
			return nil, err
		}
		// Event history is selectable in a health summary, but photos are a
		// separate privacy decision. Keep them out unless the creator explicitly
		// enabled include_photos; care_card never reaches this path.
		for i := range events {
			events[i].Payload = sharedEventPayload(events[i].Payload, opts.IncludePhotos)
		}
		data["events"] = events
		data["event_days"] = opts.Days
	}
	return data, nil
}

func sharedEventPayload(payload json.RawMessage, includePhotos bool) json.RawMessage {
	if includePhotos {
		return payload
	}
	var fields map[string]any
	if err := json.Unmarshal(payload, &fields); err != nil {
		// Timeline payloads are validated on write. If a legacy/corrupt row gets
		// here, fail closed rather than accidentally exposing opaque data.
		return json.RawMessage(`{}`)
	}
	delete(fields, "photo_data")
	sanitized, err := json.Marshal(fields)
	if err != nil {
		return json.RawMessage(`{}`)
	}
	return json.RawMessage(sanitized)
}

func petBasic(p contracts.Pet) map[string]any {
	m := map[string]any{
		"name": p.Name, "species": p.Species, "breed": p.Breed,
		"sex": p.Sex, "neutered": p.Neutered,
	}
	if p.BirthDate != nil {
		m["birth_date"] = p.BirthDate.Format("2006-01-02")
	}
	if p.WeightG != nil {
		m["weight_g"] = *p.WeightG
	}
	return m
}

func rawOr(b []byte, def any) any {
	if len(b) == 0 {
		return def
	}
	return json.RawMessage(b)
}
