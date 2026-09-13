package notify

import (
	"fmt"
	"time"

	"github.com/joinplanet/planet-api/internal/contracts"
)

// 调度参数：所有"此刻该不该发"的判定都是纯函数（无 IO、无 sleep），可直接单测。
const (
	DigestHour              = 20  // digest：圈本地 20:00 起（当天只发一次）
	AlertsHour              = 8   // alerts：圈本地 08:00 起（同上）
	ReminderGraceMinutes    = 30  // 提醒：time_of_day 过点 30 分钟仍未记录才提醒
	ReminderEscalateMinutes = 120 // 超过 2 小时：措辞升级
)

// ReminderFire：本轮应触发的一条提醒。
type ReminderFire struct {
	TaskID    string
	PetID     string
	Title     string
	Escalated bool   // 超时 ≥2 小时（措辞升级）
	DedupeKey string // 日期:任务:小时桶 —— 同一小时桶内只提醒一次
}

// DailyCatchUpUntilHour：本地时间次日凌晨 4 点前允许补发前一日的
// digest/alerts（停机跨过 20:00 窗口时当天不至于整封丢失）；"只发一次"
// 仍由 (job, family, date) 的持久化运行记录保证，补发与正常发不会重复。
const DailyCatchUpUntilHour = 4

// DecideDaily：圈本地时间 ≥ hour 点 → 返回本地日期（YYYY-MM-DD）。
// 无补发窗（alerts 用）：未到点即不触发。
// "只发一次"由调用方以 (job, family, date) 的持久化运行记录保证。
func DecideDaily(nowUTC time.Time, tz *time.Location, hour int) (string, bool) {
	local := nowUTC.In(tz)
	if local.Hour() < hour {
		return "", false
	}
	return local.Format("2006-01-02"), true
}

// DecideDailyWithCatchUp：在 DecideDaily 之上增加次日 00:00–04:00 的补发窗
// （digest 专用）：停机跨过 20:00 窗口时当天不至于整封丢失。补发与正常发
// 不会重复——去重键是 (job, family, date)。
func DecideDailyWithCatchUp(nowUTC time.Time, tz *time.Location, hour int) (string, bool) {
	local := nowUTC.In(tz)
	if local.Hour() >= hour {
		return local.Format("2006-01-02"), true
	}
	if local.Hour() < DailyCatchUpUntilHour {
		return local.AddDate(0, 0, -1).Format("2006-01-02"), true
	}
	return "", false
}

// DecideReminders：当日已排程任务中，time_of_day ≤ now-30min 且尚无 log 的触发集合。
// 输入 due 由 contracts.DueTasksProvider 给出（已过滤"有时段、当日排程、无 log"）。
func DecideReminders(nowUTC time.Time, tz *time.Location, due []contracts.DueTask) []ReminderFire {
	local := nowUTC.In(tz)
	nowMin := local.Hour()*60 + local.Minute()
	date := local.Format("2006-01-02")
	fires := []ReminderFire{}
	for _, t := range due {
		if t.TimeOfDayMinutes < 0 {
			continue // 防御：无时段不提醒
		}
		if nowMin < t.TimeOfDayMinutes+ReminderGraceMinutes {
			continue // 尚在宽限期内
		}
		fires = append(fires, ReminderFire{
			TaskID:    t.TaskID,
			PetID:     t.PetID,
			Title:     t.Title,
			Escalated: nowMin >= t.TimeOfDayMinutes+ReminderEscalateMinutes,
			DedupeKey: fmt.Sprintf("%s:%s:%02d", date, t.TaskID, local.Hour()),
		})
	}
	return fires
}

// ReminderBody：提醒文案（无指派人概念 → 提醒全员）。
func ReminderBody(fire ReminderFire) string {
	if fire.Escalated {
		return "「" + fire.Title + "」已超时 2 小时以上还没人做，快去看看吧"
	}
	return "「" + fire.Title + "」还没做哦"
}

func CareRiskBody(risk contracts.CareRisk) string {
	if risk.WaitingOnUser {
		return "「" + risk.PetName + " · " + risk.Title + "」还没有人负责，请现在确认谁来做"
	}
	if risk.EscalationFailed {
		return "「" + risk.PetName + " · " + risk.Title + "」之前的安排已过期，负责人还没完成，请重新安排"
	}
	return "「" + risk.PetName + " · " + risk.Title + "」临近或已经到时间，但还没有负责人"
}
