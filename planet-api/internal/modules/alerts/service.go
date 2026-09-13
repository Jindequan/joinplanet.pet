package alerts

import (
	"context"
	"sort"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/joinplanet/planet-api/internal/contracts"
	"github.com/joinplanet/planet-api/internal/platform/httpx"
)

type Service struct {
	Repo    *Repo
	Pool    *pgxpool.Pool
	Members contracts.MembershipService
}

var _ contracts.FamilyAlertsProvider = (*Service)(nil)

// FamilyAlerts 计算圈内全部预警（contracts.FamilyAlertsProvider；不做成员判定，
// HTTP 入口 / digest / 调度器各自完成身份校验）。结果按 occurred_at 倒序。
func (s *Service) FamilyAlerts(ctx context.Context, familyID string, now time.Time) ([]contracts.Alert, error) {
	pets, err := s.Repo.ActivePets(ctx, s.Pool, familyID)
	if err != nil {
		return nil, err
	}
	events, err := s.Repo.EventFeed(ctx, s.Pool, familyID, []string{"weight", "symptom"})
	if err != nil {
		return nil, err
	}
	pastEvents := make([]EventInfo, 0, len(events))
	for _, event := range events {
		if !event.OccurredAt.After(now) {
			pastEvents = append(pastEvents, event)
		}
	}
	alerts := WeightChangeAlerts(pets, pastEvents)
	alerts = append(alerts, SymptomRepeatAlerts(pets, pastEvents, now)...)
	medicationRows, err := s.Repo.MedicationOccurrenceFeed(ctx, s.Pool, familyID, now)
	if err != nil {
		return nil, err
	}
	alerts = append(alerts, MedicationSilenceAlerts(medicationRows, now)...)
	sort.SliceStable(alerts, func(i, j int) bool {
		return alerts[i].OccurredAt.After(alerts[j].OccurredAt)
	})
	return alerts, nil
}

// List HTTP 入口：成员判定（非成员 404）后计算。
func (s *Service) List(ctx context.Context, familyID, userID string, now time.Time) ([]contracts.Alert, error) {
	if _, ok, err := s.Members.ActiveMember(ctx, familyID, userID); err != nil {
		return nil, err
	} else if !ok {
		return nil, httpx.ErrNotFound("")
	}
	return s.FamilyAlerts(ctx, familyID, now)
}
