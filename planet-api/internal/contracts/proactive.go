// P0 主动服务（预警/摘要/提醒）的跨模块契约。
// 依赖规则不变：模块间只经本包交互，internal/app 唯一组装。
package contracts

import (
	"context"
	"time"
)

// Alert：异常预警的统一形状（alerts 模块计算；digest/notify 复用同一形状）。
type Alert struct {
	ID         string         `json:"id"`
	Kind       string         `json:"kind"` // weight_change | symptom_repeat | medication_silence
	PetID      string         `json:"pet_id"`
	PetName    string         `json:"pet_name"`
	Title      string         `json:"title"`
	Body       string         `json:"body"`
	Severity   string         `json:"severity"` // watch | warn
	OccurredAt time.Time      `json:"occurred_at"`
	Data       map[string]any `json:"data"`
}

// RecipientError：逐收件人投递失败（单个失败不中断其他收件人）。
type RecipientError struct {
	To    string `json:"to"`
	Error string `json:"error"`
}

// FamilyAlertsProvider 由 alerts 模块实现：圈内全部预警。
// 不做成员判定（HTTP 入口与 digest/调度各自完成身份校验）。
type FamilyAlertsProvider interface {
	FamilyAlerts(ctx context.Context, familyID string, now time.Time) ([]Alert, error)
}

// DigestTaskItem：digest 视图的当日任务项。
type DigestTaskItem struct {
	OccurrenceID     string
	CareRequestID    string
	CareRequestState string
	Title            string
	TimeOfDay        *string // "HH:MM"（未设置为 nil）
	Status           string  // done | skipped | pending | missed
	DoneByName       string
	DoneAt           *time.Time
}

// DigestPetGroup：digest 视图的按宠物分组。
type DigestPetGroup struct {
	PetID   string
	PetName string
	Items   []DigestTaskItem
}

// DigestTasksProvider 由 tasks 模块实现：复用 Today 的查询与排程判断。
type DigestTasksProvider interface {
	// TodayForDigest 返回 (date, timezone, 按宠物的当日任务分组)。
	TodayForDigest(ctx context.Context, familyID, dateStr string, now time.Time) (string, string, []DigestPetGroup, error)
}

// DigestSendResult：digest 发送结果（逐收件人容错）。
type DigestSendResult struct {
	Sent     int              `json:"sent"`
	Skipped  bool             `json:"skipped,omitempty"` // 当天该圈的摘要已投递过（按 job_runs 去重）
	Failures []RecipientError `json:"failures,omitempty"`
}

// DigestSender 由 digest 模块实现：向圈内开启摘要偏好的成员发送某日摘要邮件。
type DigestSender interface {
	// SendDigest 直接发送（planet-cli 运维补发用；无去重）。
	SendDigest(ctx context.Context, familyID, dateStr string, now time.Time) (DigestSendResult, error)
	// SendDigestOnce 按 (family, date) 经 job_runs 持久去重后发送：
	// 手动触发与调度器共用同一天只投递一次，重启安全。
	SendDigestOnce(ctx context.Context, familyID, dateStr string, now time.Time) (DigestSendResult, error)
}

// DueTask：提醒候选（当日已排程、有提示时段、尚无 log 的任务）。
type DueTask struct {
	TaskID           string
	PetID            string
	Title            string
	TimeOfDayMinutes int // 圈时区的当日分钟数；<0 = 未设置（未设置不进结果）
}

// DueTasksProvider 由 tasks 模块实现。
type DueTasksProvider interface {
	DueForReminder(ctx context.Context, familyID string, now time.Time) ([]DueTask, error)
}

// CareRisk：临近到期但尚无负责人，或请求仍无人接手的照护风险。
type CareRisk struct {
	OccurrenceID     string
	RequestID        string
	PetID            string
	PetName          string
	Title            string
	DueAt            time.Time
	FamilyTimezone   string
	WaitingOnUser    bool
	EscalationFailed bool
}

// CareRiskProvider 由 tasks 模块实现，复用 Occurrence 与 Care Request 事实。
type CareRiskProvider interface {
	UnassignedCareRisks(ctx context.Context, familyID string, now time.Time) ([]CareRisk, error)
}

// CareRequestExpiryProvider 由 carecoord 模块实现：把超过照护截止时间仍未响应的
// 请求收束为 expired，避免过期行动卡继续争抢已经失去时效的责任。
type CareRequestExpiryProvider interface {
	ExpireDueForFamily(ctx context.Context, familyID string, now time.Time) (int, error)
}

// CareRequestAutomationProvider 是 carecoord 的调度边界：自动升级只创建
// 请求卡，不直接改变 occurrence 的负责人；负责人仍以成员主动接手为准。
type CareRequestAutomationProvider interface {
	CareRequestExpiryProvider
	EscalateForFamily(ctx context.Context, familyID string, now time.Time) (int, error)
}

// MembersReader 由 families 模块实现：列出圈的全部活跃成员（通知投递用）。
type MembersReader interface {
	ListMembers(ctx context.Context, familyID string) ([]Member, error)
}

// MembersWithPrefReader 由 families 模块实现：列出开启了某类通知偏好
// （reminders|digest|alerts）的活跃成员。偏好属于成员关系：同一用户在
// 不同圈的偏好可以不同。
type MembersWithPrefReader interface {
	ListMembersWithPref(ctx context.Context, familyID, pref string) ([]Member, error)
}

// JobRunClaimer 由 notify.Repo 实现：job_runs 表的持久一次性运行权。
// 调度器与手动触发共用同一把锁，同一 (job, family, dedupe_key) 全天只跑一次。
type JobRunClaimer interface {
	ClaimRun(ctx context.Context, q Q, job, familyID, dedupeKey string) (bool, error)
	CompleteRun(ctx context.Context, q Q, job, familyID, dedupeKey string) error
	FailRun(ctx context.Context, q Q, job, familyID, dedupeKey, message string) error
}

// FamilyMetaReader 由 families 模块实现：圈的基础信息（名称等；已删除 → 404）。
type FamilyMetaReader interface {
	FamilyMeta(ctx context.Context, familyID string) (Family, error)
}

// FamilyRef：调度器遍历所需的圈引用。
type FamilyRef struct {
	ID       string
	Name     string
	Timezone string
}

// FamiliesReader 由 families 模块实现：全部未删除的圈。
type FamiliesReader interface {
	LiveFamilies(ctx context.Context) ([]FamilyRef, error)
}
