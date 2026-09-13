package handoffs

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/joinplanet/planet-api/internal/contracts"
	"github.com/joinplanet/planet-api/internal/platform/clockx"
	"github.com/joinplanet/planet-api/internal/platform/db"
	"github.com/joinplanet/planet-api/internal/platform/httpx"
)

type PetSummary struct {
	PetID        string
	PetName      string
	PendingToday int
	Handoff      *Handoff
}

type Service struct {
	Repo    *Repo
	Pool    *pgxpool.Pool
	Guard   contracts.PetsGuard
	Members contracts.MembershipService
	Today   contracts.TodayReader
	Notes   contracts.HandoffNoteRecorder
	Clock   clockx.Clock
}

func (s *Service) GetActive(ctx context.Context, petID, userID string) (*Handoff, error) {
	if _, _, err := s.Guard.RequirePet(ctx, petID, false, false); err != nil {
		return nil, err
	}
	var h Handoff
	var ok bool
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		var err error
		h, ok, err = s.Repo.ActiveByPet(ctx, tx, petID)
		return err
	})
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, nil
	}
	return &h, nil
}

func (s *Service) ClaimWithIdempotency(ctx context.Context, petID, userID, note, idempotencyKey string) (Handoff, error) {
	note = strings.TrimSpace(note)
	var result Handoff
	err := db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		_, member, err := s.Guard.RequirePetInTx(ctx, tx, petID, userID, false, true)
		if err != nil {
			return err
		}
		if member.Role == contracts.RoleViewer || member.Role == contracts.RoleReadOnly {
			return httpx.ErrRoleForbidden()
		}
		scope := "handoff:" + petID
		claim, err := db.ClaimIdempotency(ctx, tx, userID, scope, idempotencyKey, db.RequestHash(petID, userID, note))
		if errors.Is(err, db.ErrIdempotencyKeyReused) {
			return httpx.NewAppError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different request")
		}
		if err != nil {
			return err
		}
		if claim.Replay {
			h, ok, err := s.Repo.ActiveByPet(ctx, tx, petID)
			if err != nil {
				return err
			}
			if !ok {
				return httpx.ErrNotFound("")
			}
			result = h
			return nil
		}

		now := s.Clock.Now().UTC()
		prev, hasPrev, err := s.Repo.ActiveByPet(ctx, tx, petID)
		if err != nil {
			return err
		}
		if hasPrev && prev.UserID == userID {
			result = prev
			return db.BindIdempotency(ctx, tx, userID, scope, idempotencyKey, "handoff", prev.ID)
		}
		if hasPrev {
			if err := s.Repo.EndActive(ctx, tx, petID, now); err != nil {
				return err
			}
			fromName := prev.UserName
			var toName string
			if err := tx.QueryRow(ctx, `SELECT COALESCE(display_name, '') FROM users WHERE id = $1`, userID).Scan(&toName); err != nil {
				return err
			}
			text := handoffNote(fromName, toName, note)
			if err := s.Notes.RecordHandoffNote(ctx, tx, petID, userID, text); err != nil {
				return err
			}
		} else if note != "" {
			var name string
			if err := tx.QueryRow(ctx, `SELECT COALESCE(display_name, '') FROM users WHERE id = $1`, userID).Scan(&name); err != nil {
				return err
			}
			text := fmt.Sprintf("%s 开始负责照护", strings.TrimSpace(name))
			if note != "" {
				text = text + "：" + note
			}
			if err := s.Notes.RecordHandoffNote(ctx, tx, petID, userID, text); err != nil {
				return err
			}
		}

		h, err := s.Repo.Insert(ctx, tx, petID, userID, userID, now)
		if err != nil {
			return err
		}
		result = h
		return db.BindIdempotency(ctx, tx, userID, scope, idempotencyKey, "handoff", h.ID)
	})
	return result, err
}

func (s *Service) ReleaseWithIdempotency(ctx context.Context, petID, userID, note, idempotencyKey string) error {
	note = strings.TrimSpace(note)
	return db.InTx(ctx, s.Pool, func(tx pgx.Tx) error {
		// 结束值班是生命周期操作而非照护写入：归档宠上值班者必须仍能释放
		// （mutable=true 会撞 PET_ARCHIVED 把人卡死在值班态）。
		_, member, err := s.Guard.RequirePetInTx(ctx, tx, petID, userID, false, false)
		if err != nil {
			return err
		}
		if member.Role == contracts.RoleViewer || member.Role == contracts.RoleReadOnly {
			return httpx.ErrRoleForbidden()
		}
		scope := "handoff-release:" + petID
		claim, err := db.ClaimIdempotency(ctx, tx, userID, scope, idempotencyKey, db.RequestHash(petID, userID, note))
		if errors.Is(err, db.ErrIdempotencyKeyReused) {
			return httpx.NewAppError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different request")
		}
		if err != nil {
			return err
		}
		if claim.Replay {
			return nil
		}
		active, ok, err := s.Repo.ActiveByPet(ctx, tx, petID)
		if err != nil {
			return err
		}
		if !ok {
			return httpx.ErrNotFound("")
		}
		if active.UserID != userID {
			return httpx.NewAppError(http.StatusForbidden, "HANDOFF_FORBIDDEN", "only the on-duty member can release")
		}
		now := s.Clock.Now().UTC()
		if err := s.Repo.EndActive(ctx, tx, petID, now); err != nil {
			return err
		}
		var name string
		if err := tx.QueryRow(ctx, `SELECT COALESCE(display_name, '') FROM users WHERE id = $1`, userID).Scan(&name); err != nil {
			return err
		}
		text := fmt.Sprintf("%s 不再负责照护", strings.TrimSpace(name))
		if note != "" {
			text = text + "：" + note
		}
		if err := s.Notes.RecordHandoffNote(ctx, tx, petID, userID, text); err != nil {
			return err
		}
		return db.BindIdempotency(ctx, tx, userID, scope, idempotencyKey, "handoff", active.ID)
	})
}

func (s *Service) FamilySummary(ctx context.Context, familyID, userID string) ([]PetSummary, error) {
	if _, ok, err := s.Members.ActiveMember(ctx, familyID, userID); err != nil {
		return nil, err
	} else if !ok {
		return nil, httpx.ErrNotFound("")
	}

	handoffs, err := s.Repo.ListActiveForFamily(ctx, familyID)
	if err != nil {
		return nil, err
	}
	byPetHandoff := map[string]Handoff{}
	for _, h := range handoffs {
		byPetHandoff[h.PetID] = h
	}

	familyPets, err := s.Repo.ListFamilyPets(ctx, familyID)
	if err != nil {
		return nil, err
	}

	groups, err := s.Today.TodayForShare(ctx, familyID, s.Clock.Now().UTC())
	if err != nil {
		return nil, err
	}
	pendingByPet := map[string]int{}
	nameByPet := map[string]string{}
	for _, g := range groups {
		nameByPet[g.PetID] = g.PetName
		pending := 0
		for _, item := range g.Items {
			if item.LogStatus == nil {
				pending++
			}
		}
		pendingByPet[g.PetID] = pending
	}

	out := make([]PetSummary, 0, len(familyPets))
	for _, pet := range familyPets {
		summary := PetSummary{
			PetID:        pet.ID,
			PetName:      pet.Name,
			PendingToday: pendingByPet[pet.ID],
		}
		if h, ok := byPetHandoff[pet.ID]; ok {
			copy := h
			summary.Handoff = &copy
		}
		out = append(out, summary)
	}
	return out, nil
}

func handoffNote(fromName, toName, note string) string {
	fromName = strings.TrimSpace(fromName)
	toName = strings.TrimSpace(toName)
	text := fmt.Sprintf("%s 交给 %s", fromName, toName)
	if note != "" {
		text = text + "：" + note
	}
	return text
}

func handoffDTO(h Handoff, viewerID string) map[string]any {
	return map[string]any{
		"id":         h.ID,
		"pet_id":     h.PetID,
		"user_id":    h.UserID,
		"user_name":  h.UserName,
		"started_at": h.StartedAt,
		"is_me":      h.UserID == viewerID,
	}
}
