// Package tasks：PLANET Care System 的规则解析。排程 v1 语法：daily / weekly / monthly / interval / once。
package tasks

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/joinplanet/planet-api/internal/platform/httpx"
)

// Schedule JSONB 语法（版本化，BACKEND-DESIGN §13.4）：
//
//	{"v":1,"kind":"daily"}
//	{"v":1,"kind":"weekly","days":[1..7]}        // ISO：1=周一 … 7=周日
//	{"v":1,"kind":"interval","every_n":2}        // 自创建日起每 N 天
type Schedule struct {
	V        int    `json:"v"`
	Kind     string `json:"kind"`
	Days     []int  `json:"days,omitempty"`
	Day      int    `json:"day,omitempty"`
	EveryN   int    `json:"every_n,omitempty"`
	OnceDate string `json:"date,omitempty"` // YYYY-MM-DD for kind=once
}

func ParseSchedule(raw []byte) (Schedule, error) {
	var s Schedule
	if len(raw) == 0 {
		return s, httpx.ErrValidation("schedule is required")
	}
	if err := json.Unmarshal(raw, &s); err != nil {
		return s, httpx.ErrValidation("invalid schedule")
	}
	if s.V != 1 {
		return s, httpx.ErrValidation("unsupported schedule version")
	}
	switch s.Kind {
	case "daily":
		return s, nil
	case "weekly":
		if len(s.Days) == 0 || len(s.Days) > 7 {
			return s, httpx.ErrValidation("weekly schedule requires 1-7 days")
		}
		seen := map[int]bool{}
		for _, d := range s.Days {
			if d < 1 || d > 7 || seen[d] {
				return s, httpx.ErrValidation("days must be unique ISO weekdays 1-7")
			}
			seen[d] = true
		}
		return s, nil
	case "monthly":
		if s.Day < 1 || s.Day > 31 {
			return s, httpx.ErrValidation("monthly schedule day must be 1-31")
		}
		return s, nil
	case "interval":
		if s.EveryN < 1 || s.EveryN > 365 {
			return s, httpx.ErrValidation("every_n must be 1-365")
		}
		return s, nil
	case "once":
		if s.OnceDate == "" {
			return s, httpx.ErrValidation("once schedule requires date")
		}
		if _, err := time.Parse("2006-01-02", s.OnceDate); err != nil {
			return s, httpx.ErrValidation("once schedule date must be YYYY-MM-DD")
		}
		return s, nil
	default:
		return s, httpx.ErrValidation("schedule kind must be daily|weekly|monthly|interval|once")
	}
}

// ValidateScheduleTransition protects the meaning of a one-time care item.
// It may be edited in place (for example, its title or time), but it must not
// silently turn into a recurring plan through an older update endpoint.
func ValidateScheduleTransition(oldRaw, nextRaw []byte) error {
	oldSchedule, err := ParseSchedule(oldRaw)
	if err != nil {
		return err
	}
	nextSchedule, err := ParseSchedule(nextRaw)
	if err != nil {
		return err
	}
	if oldSchedule.Kind == "once" && nextSchedule.Kind != "once" {
		return httpx.ErrValidation("one-time care cannot become recurring")
	}
	return nil
}

// ScheduledOn 判断任务在 date（圈时区）当天是否排程。
// createdAt 转圈时区后按公历日期计算天数差。不要用时长除以 24：
// DST 切换日的 noon-to-noon 可能是 23/25 小时，会让 interval 任务错一天。
func (s Schedule) ScheduledOn(date time.Time, createdAt time.Time, tz *time.Location) bool {
	d := date.In(tz)
	switch s.Kind {
	case "daily":
		return true
	case "weekly":
		iso := ((int(d.Weekday()) + 6) % 7) + 1
		for _, day := range s.Days {
			if day == iso {
				return true
			}
		}
		return false
	case "monthly":
		// 钉底语义：31 号规则在短月落到当月最后一天（28/29/30），
		// 而不是整月静默跳过。
		lastDay := time.Date(d.Year(), d.Month()+1, 0, 0, 0, 0, 0, time.UTC).Day()
		return d.Day() == s.Day || (s.Day > lastDay && d.Day() == lastDay)
	case "interval":
		// createdAt is a civil start date for care rules. Do not reinterpret a
		// PostgreSQL DATE (decoded at UTC midnight) as an instant.
		cYear, cMonth, cDay := createdAt.Date()
		cDate := time.Date(cYear, cMonth, cDay, 0, 0, 0, 0, time.UTC)
		dDate := time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, time.UTC)
		diff := int64(dDate.Sub(cDate).Hours() / 24)
		if diff < 0 {
			return false // 查询日早于任务创建日
		}
		return diff%int64(s.EveryN) == 0
	case "once":
		return calendarKey(date, tz) == s.OnceDate
	default:
		return false
	}
}

func (s Schedule) String() string {
	switch s.Kind {
	case "weekly":
		return fmt.Sprintf("weekly %v", s.Days)
	case "interval":
		return fmt.Sprintf("every %d days", s.EveryN)
	case "once":
		return fmt.Sprintf("once on %s", s.OnceDate)
	default:
		return "daily"
	}
}
