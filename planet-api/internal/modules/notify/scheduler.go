package notify

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/joinplanet/planet-api/internal/contracts"
	"github.com/joinplanet/planet-api/internal/platform/clockx"
)

// Scheduler：P0 主动服务的 1 分钟轮询调度器。
// cmd/planet-api 在 PLANET_SCHEDULER=1 时才启动（默认关，测试不受影响）。
// 一次性语义：digest/alerts 按 (job, family, 日期)、reminder 按 (family, 日期:任务:小时桶)
// Claim a durable job-run row; restarts cannot send the same bucket twice.
type Scheduler struct {
	Repo         *Repo
	Pool         *pgxpool.Pool
	Log          *slog.Logger
	Clock        clockx.Clock
	Families     contracts.FamiliesReader
	Due          contracts.DueTasksProvider
	Risks        contracts.CareRiskProvider
	CareRequests contracts.CareRequestAutomationProvider
	Alerts       contracts.FamilyAlertsProvider
	Digest       contracts.DigestSender
	Notify       *Service
}

// Run 阻塞运行（ctx 取消即退出）；启动时先跑一轮再进入 1 分钟节拍。
func (s *Scheduler) Run(ctx context.Context) {
	s.tick(ctx, s.Clock.Now())
	t := time.NewTicker(time.Minute)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s.tick(ctx, s.Clock.Now())
		}
	}
}

// tickCount 用于心跳节流：每 10 个 tick（约 10 分钟）打一条 Info 心跳，
// 让"调度器还活着"在 journald 里可查；超过 30s 的慢 tick 一律 Warn。
var tickCount int64

func (s *Scheduler) tick(ctx context.Context, now time.Time) {
	if s.Notify != nil {
		sent, parked, err := s.Notify.DrainOutbox(ctx, 50)
		if err != nil {
			s.Log.Error("scheduler: notification outbox", "err", err.Error())
		} else if sent > 0 || parked > 0 {
			s.Log.Info("scheduler: notification outbox drained", "sent", sent, "parked", parked)
		}
	}
	start := time.Now()
	families, err := s.Families.LiveFamilies(ctx)
	if err != nil {
		s.Log.Error("scheduler: live families", "err", err.Error())
		return
	}
	for _, c := range families {
		s.tickFamily(ctx, c, now)
	}
	elapsed := time.Since(start)
	n := atomic.AddInt64(&tickCount, 1)
	if elapsed > 30*time.Second {
		s.Log.Warn("scheduler: slow tick", "families", len(families), "duration_ms", elapsed.Milliseconds())
	} else if n%10 == 1 {
		s.Log.Info("scheduler: heartbeat", "tick", n, "families", len(families), "duration_ms", elapsed.Milliseconds())
	}
}

func (s *Scheduler) tickFamily(ctx context.Context, c contracts.FamilyRef, now time.Time) {
	tz, err := time.LoadLocation(c.Timezone)
	if err != nil {
		s.Log.Warn("scheduler: bad timezone", "family", c.ID, "tz", c.Timezone)
		return
	}
	if s.CareRequests != nil {
		expired, err := s.CareRequests.ExpireDueForFamily(ctx, c.ID, now)
		if err != nil {
			s.Log.Error("scheduler: expire care requests", "family", c.ID, "err", err.Error())
		} else if expired > 0 {
			s.Log.Info("scheduler: care requests expired", "family", c.ID, "count", expired)
		}
		escalated, err := s.CareRequests.EscalateForFamily(ctx, c.ID, now)
		if err != nil {
			s.Log.Error("scheduler: escalate care requests", "family", c.ID, "err", err.Error())
		} else if escalated > 0 {
			s.Log.Info("scheduler: care requests escalated", "family", c.ID, "count", escalated)
		}
	}
	// digest：圈本地 ≥20:00，每圈每天一次；次日 00:00–04:00 可补发昨日。
	// SendDigestOnce 内部按 (family, 业务日) 认领 job_runs，手动触发与调度
	// 共用同一把锁。
	if date, ok := DecideDailyWithCatchUp(now, tz, DigestHour); ok {
		res, err := s.Digest.SendDigestOnce(ctx, c.ID, date, now)
		if err != nil {
			s.Log.Error("scheduler: digest", "family", c.ID, "date", date, "err", err.Error())
		} else if !res.Skipped {
			s.Log.Info("scheduler: digest sent", "family", c.ID, "date", date,
				"sent", res.Sent, "failures", len(res.Failures))
		}
	}
	// alerts：圈本地 ≥08:00，每圈每天一次；空预警不打扰
	if date, ok := DecideDaily(now, tz, AlertsHour); ok {
		s.runOnce(ctx, "alerts", c.ID, date, func() error {
			alerts, err := s.Alerts.FamilyAlerts(ctx, c.ID, now)
			if err != nil {
				return err
			}
			if len(alerts) == 0 {
				return nil
			}
			var b strings.Builder
			for i, a := range alerts {
				if i > 0 {
					b.WriteString("\n")
				}
				b.WriteString("· [" + a.Severity + "] " + a.Title + "：" + a.Body)
			}
			sent, failures := s.Notify.NotifyFamily(ctx, c.ID, "alerts",
				"PLANET 预警："+c.Name, b.String())
			s.Log.Info("scheduler: alerts notified", "family", c.ID,
				"alerts", len(alerts), "sent", sent, "failures", len(failures))
			return deliveryFailure("alerts", sent, failures)
		})
	}
	// reminder：当日任务过点 30 分钟未做 → 提醒全员（小时桶去重）
	due, err := s.Due.DueForReminder(ctx, c.ID, now)
	if err != nil {
		s.Log.Error("scheduler: due tasks", "family", c.ID, "err", err.Error())
		return
	}
	for _, fire := range DecideReminders(now, tz, due) {
		s.runOnce(ctx, "reminder", c.ID, fire.DedupeKey, func() error {
			sent, failures := s.Notify.NotifyFamilyData(ctx, c.ID, "reminders",
				"PLANET 提醒", ReminderBody(fire), map[string]string{
					"occurrence_id": fire.TaskID,
					"family_id":     c.ID,
					"pet_id":        fire.PetID,
				})
			s.Log.Info("scheduler: reminder nudged", "family", c.ID,
				"task", fire.TaskID, "escalated", fire.Escalated, "sent", sent, "failures", len(failures))
			return deliveryFailure("reminder", sent, failures)
		})
	}
	if s.Risks == nil {
		return
	}
	risks, err := s.Risks.UnassignedCareRisks(ctx, c.ID, now)
	if err != nil {
		s.Log.Error("scheduler: care risks", "family", c.ID, "err", err.Error())
		return
	}
	local := now.In(tz)
	for _, risk := range risks {
		dedupeKey := fmt.Sprintf("%s:%s:%02d", local.Format("2006-01-02"), risk.OccurrenceID, local.Hour())
		risk := risk
		s.runOnce(ctx, "care-risk", c.ID, dedupeKey, func() error {
			sent, failures := s.Notify.NotifyFamilyData(ctx, c.ID, "alerts", "PLANET 照护风险", CareRiskBody(risk), map[string]string{
				"occurrence_id": risk.OccurrenceID,
				"family_id":     c.ID,
				"pet_id":        risk.PetID,
			})
			s.Log.Info("scheduler: care risk notified", "family", c.ID, "occurrence", risk.OccurrenceID, "sent", sent, "failures", len(failures))
			return deliveryFailure("care-risk", sent, failures)
		})
	}
}

// deliveryFailure retries only an all-recipient outage. If at least one
// recipient received a notification, the job is completed to avoid sending
// duplicates to that recipient on the next tick; partial failures remain in
// the log for operational follow-up.
func deliveryFailure(kind string, sent int, failures []contracts.RecipientError) error {
	if sent > 0 || len(failures) == 0 {
		return nil
	}
	return fmt.Errorf("%s notification delivery failed for all recipients (%d failures)", kind, len(failures))
}

// runOnce claims a durable job-run row before executing fn.
func (s *Scheduler) runOnce(ctx context.Context, job, familyID, dedupeKey string, fn func() error) {
	claimed, err := s.Repo.ClaimRun(ctx, s.Pool, job, familyID, dedupeKey)
	if err != nil {
		s.Log.Error("scheduler: claim run", "job", job, "family", familyID, "err", err.Error())
		return
	}
	if !claimed {
		return
	}
	if err := fn(); err != nil {
		if markErr := s.Repo.FailRun(ctx, s.Pool, job, familyID, dedupeKey, err.Error()); markErr != nil {
			s.Log.Error("scheduler: mark failed", "job", job, "family", familyID, "err", markErr.Error())
		}
		s.Log.Error("scheduler: job failed", "job", job, "family", familyID, "err", err.Error())
		return
	}
	if err := s.Repo.CompleteRun(ctx, s.Pool, job, familyID, dedupeKey); err != nil {
		s.Log.Error("scheduler: mark succeeded", "job", job, "family", familyID, "err", err.Error())
	}
}
