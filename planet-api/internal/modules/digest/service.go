// Package digest：每日摘要（P0）。复用 tasks.Today 的查询与 alerts 的规则，
// GET 返回结构化视图；POST /send 与调度器把纯文本邮件发给全体成员邮箱。
package digest

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/joinplanet/planet-api/internal/contracts"
	"github.com/joinplanet/planet-api/internal/platform/clockx"
	"github.com/joinplanet/planet-api/internal/platform/email"
	"github.com/joinplanet/planet-api/internal/platform/httpx"
)

type Service struct {
	Pool           *pgxpool.Pool
	Gate           contracts.MembershipService     // 成员判定（HTTP 入口）
	EnabledMembers contracts.MembersWithPrefReader // 开启摘要偏好的成员（投递）
	Meta           contracts.FamilyMetaReader      // 圈名（邮件标题）
	Tasks          contracts.DigestTasksProvider
	Alerts         contracts.FamilyAlertsProvider
	Runs           contracts.JobRunClaimer // digest 每圈每天一次的持久去重
	Mail           email.TextSender
	Clock          clockx.Clock
}

var _ contracts.DigestSender = (*Service)(nil)

// Compose 组装某日的结构化摘要（不做成员判定；GET / 调度器 / CLI 共用）。
func (s *Service) Compose(ctx context.Context, familyID, dateStr string, now time.Time) (DigestView, error) {
	date, tzName, groups, err := s.Tasks.TodayForDigest(ctx, familyID, dateStr, now)
	if err != nil {
		return DigestView{}, err
	}
	alerts, err := s.Alerts.FamilyAlerts(ctx, familyID, now)
	if err != nil {
		return DigestView{}, err
	}
	byPet := map[string][]contracts.Alert{}
	for _, a := range alerts {
		byPet[a.PetID] = append(byPet[a.PetID], a)
	}
	view := DigestView{Date: date, Timezone: tzName, Pets: []PetDigest{}}
	seenPets := make(map[string]bool, len(groups)+len(byPet))
	for _, g := range groups {
		seenPets[g.PetID] = true
		p := PetDigest{PetID: g.PetID, PetName: g.PetName,
			Done: []DoneItem{}, Pending: []PendingItem{}, Skipped: []DoneItem{}, Alerts: byPet[g.PetID]}
		for _, it := range g.Items {
			switch it.Status {
			case "done", "skipped":
				item := DoneItem{OccurrenceID: it.OccurrenceID, CareRequestID: it.CareRequestID, Title: it.Title, ByName: it.DoneByName, At: time.Now()}
				if it.DoneAt != nil {
					item.At = *it.DoneAt
				}
				if it.Status == "done" {
					p.Done = append(p.Done, item)
				} else {
					p.Skipped = append(p.Skipped, item)
				}
			case "missed":
				p.Pending = append(p.Pending, PendingItem{OccurrenceID: it.OccurrenceID, CareRequestID: it.CareRequestID, CareRequestState: it.CareRequestState, Title: it.Title, TimeOfDay: it.TimeOfDay})
			default: // pending
				p.Pending = append(p.Pending, PendingItem{OccurrenceID: it.OccurrenceID, CareRequestID: it.CareRequestID, CareRequestState: it.CareRequestState, Title: it.Title, TimeOfDay: it.TimeOfDay})
			}
		}
		if p.Alerts == nil {
			p.Alerts = []contracts.Alert{}
		}
		view.Pets = append(view.Pets, p)
	}
	// A pet can have a meaningful alert even when it has no care plan
	// scheduled for the requested day. Keep that alert visible in the digest
	// instead of letting the task projection silently hide the pet.
	for _, a := range alerts {
		if seenPets[a.PetID] {
			continue
		}
		seenPets[a.PetID] = true
		view.Pets = append(view.Pets, PetDigest{
			PetID: a.PetID, PetName: a.PetName,
			Done: []DoneItem{}, Pending: []PendingItem{}, Skipped: []DoneItem{},
			Alerts: byPet[a.PetID],
		})
	}
	return view, nil
}

// View HTTP GET 入口：成员判定（非成员 404）+ Compose。
func (s *Service) View(ctx context.Context, familyID, userID, dateStr string, now time.Time) (DigestView, error) {
	if _, ok, err := s.Gate.ActiveMember(ctx, familyID, userID); err != nil {
		return DigestView{}, err
	} else if !ok {
		return DigestView{}, httpx.ErrNotFound("")
	}
	return s.Compose(ctx, familyID, dateStr, now)
}

// ComposeEmailForFamily 组装视图并渲染邮件文本（planet-cli digest --dry-run 用）。
func (s *Service) ComposeEmailForFamily(ctx context.Context, familyID, dateStr string, now time.Time) (DigestView, string, string, error) {
	view, err := s.Compose(ctx, familyID, dateStr, now)
	if err != nil {
		return DigestView{}, "", "", err
	}
	meta, err := s.Meta.FamilyMeta(ctx, familyID)
	if err != nil {
		return DigestView{}, "", "", err
	}
	subject, text := ComposeEmail(meta.Name, view.Date, view.Pets)
	return view, subject, text, nil
}

// SendDigest 向圈内开启了摘要偏好（digest_enabled）的成员邮箱发送某日摘要。
// 单个收件人失败不中断其余；返回成功数与逐收件人错误。
// 无去重：planet-cli 运维补发直用本方法；产品路径（HTTP 手动触发与调度器）
// 一律走 SendDigestOnce。
func (s *Service) SendDigest(ctx context.Context, familyID, dateStr string, now time.Time) (contracts.DigestSendResult, error) {
	view, err := s.Compose(ctx, familyID, dateStr, now)
	if err != nil {
		return contracts.DigestSendResult{}, err
	}
	meta, err := s.Meta.FamilyMeta(ctx, familyID)
	if err != nil {
		return contracts.DigestSendResult{}, err
	}
	members, err := s.EnabledMembers.ListMembersWithPref(ctx, familyID, "digest")
	if err != nil {
		return contracts.DigestSendResult{}, err
	}
	subject, text := ComposeEmail(meta.Name, view.Date, view.Pets)
	res := contracts.DigestSendResult{Sent: 0, Failures: []contracts.RecipientError{}}
	for _, m := range members {
		if err := s.Mail.SendText(ctx, m.Email, subject, text, "digest"); err != nil {
			res.Failures = append(res.Failures, contracts.RecipientError{To: m.Email, Error: err.Error()})
			continue
		}
		res.Sent++
	}
	return res, nil
}

// SendDigestOnce：先按 (family, 业务日) 认领 job_runs 的 digest 运行权，
// 认领成功才发送。手动触发与 20:00 调度共用同一把锁 → 每圈每天最多投递一次，
// 重启安全。失败走 FailRun（1 分钟后重试，重试上限见 notify.Repo）。
func (s *Service) SendDigestOnce(ctx context.Context, familyID, dateStr string, now time.Time) (contracts.DigestSendResult, error) {
	date, err := s.resolveDate(ctx, familyID, dateStr, now)
	if err != nil {
		return contracts.DigestSendResult{}, err
	}
	claimed, err := s.Runs.ClaimRun(ctx, s.Pool, "digest", familyID, date)
	if err != nil {
		return contracts.DigestSendResult{}, err
	}
	if !claimed {
		return contracts.DigestSendResult{Skipped: true, Failures: []contracts.RecipientError{}}, nil
	}
	res, err := s.SendDigest(ctx, familyID, dateStr, now)
	if err == nil && res.Sent == 0 && len(res.Failures) > 0 {
		err = fmt.Errorf("digest delivery failed for all recipients (%d failures)", len(res.Failures))
	}
	if err != nil {
		if markErr := s.Runs.FailRun(ctx, s.Pool, "digest", familyID, date, err.Error()); markErr != nil {
			// 标记失败不影响返回原始错误；二次失败只影响下一分钟的重试节奏
			_ = markErr
		}
		return contracts.DigestSendResult{}, err
	}
	if err := s.Runs.CompleteRun(ctx, s.Pool, "digest", familyID, date); err != nil {
		return res, err
	}
	return res, nil
}

// resolveDate 在认领去重键之前解析业务日：显式 date 优先（校验格式且不允许
// 未来日期），缺省按圈时区的今天。与 TodayForDigest 的解析规则保持一致。
func (s *Service) resolveDate(ctx context.Context, familyID, dateStr string, now time.Time) (string, error) {
	meta, err := s.Meta.FamilyMeta(ctx, familyID)
	if err != nil {
		return "", err
	}
	tz, terr := time.LoadLocation(meta.Timezone)
	if terr != nil {
		return "", httpx.ErrInternal("invalid family timezone")
	}
	if dateStr == "" {
		return now.In(tz).Format("2006-01-02"), nil
	}
	date, perr := time.ParseInLocation("2006-01-02", dateStr, tz)
	if perr != nil {
		return "", httpx.ErrValidation("date must be YYYY-MM-DD")
	}
	if date.After(dateAt(now, tz)) {
		return "", httpx.ErrValidation("future dates are not allowed")
	}
	return dateStr, nil
}

func dateAt(t time.Time, tz *time.Location) time.Time {
	d := t.In(tz)
	return time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, tz)
}
