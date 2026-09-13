package contracts

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Q 是 pool 与事务共同满足的最小查询接口（跨模块契约的一部分）。
type Q interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// TimelineRecorder：用药等模块写自动事件的通道（跨模块只走接口）。
type TimelineRecorder interface {
	RecordAuto(ctx context.Context, q Q, familyID, petID, eventType string, occurredAt time.Time, byUserID, source string, payload []byte) error
}

// UserNotifier 向单个用户投递可操作的照护请求通知。
// 请求本身先持久化；投递失败不能回滚照护协作事实，收件箱仍是权威入口。
type UserNotifier interface {
	NotifyUser(ctx context.Context, userID, title, body, kind string) error
	NotifyUserData(ctx context.Context, userID, title, body, kind string, data map[string]string) error
}

// CareRequestCancellationNotice is the post-commit notification produced
// when a completed/skipped occurrence closes an outstanding handoff request.
type CareRequestCancellationNotice struct {
	UserID    string
	RequestID string
	FamilyID  string
	PetID     string
	PetName   string
	Title     string
	Body      string
}

// CareRequestCloser lets the canonical care execution transaction close stale
// action cards without importing the carecoord module. The implementation
// must use the caller-owned transaction so occurrence, log, request state and
// audit event commit or roll back together.
type CareRequestCloser interface {
	OpenForTarget(ctx context.Context, q Q, occurrenceID, userID string) (bool, error)
	AcceptedForOther(ctx context.Context, q Q, occurrenceID, userID string) (bool, error)
	CancelOpenForOccurrence(ctx context.Context, q Q, occurrenceID, actorID, reason string) ([]CareRequestCancellationNotice, error)
	CancelOpenForFamilyMember(ctx context.Context, q Q, familyID, memberID, actorID, reason string) ([]CareRequestCancellationNotice, error)
}

// PetShareInvalidator：生命周期变更时撤销 Pet 的外部匿名访问凭证。
// 调用方必须在同一事务中执行，确保所有权交接不会留下旧分享窗口。
type PetShareInvalidator interface {
	RevokeForPet(ctx context.Context, q Q, petID string) error
}

// PetWeightSetter 由 pets 模块实现；weight 时间线发生任何变化后，按事件
// 的实际时间重新计算 pets.weight_g，避免编辑旧记录或删除最新记录造成账实分离。
type PetWeightSetter interface {
	RecalculateWeight(ctx context.Context, q Q, petID string) error
}

// StandingHandoffCleaner removes a member's active standing responsibility
// when family governance makes that member view-only or ends the membership.
// Historical handoff records remain untouched; only the active assignment is
// closed inside the caller-owned governance transaction.
type StandingHandoffCleaner interface {
	EndForFamilyMember(ctx context.Context, q Q, familyID, userID string) error
}
