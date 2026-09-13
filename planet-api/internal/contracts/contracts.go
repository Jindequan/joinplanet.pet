// Package contracts 定义跨模块共享的领域类型与接口。
// 依赖规则（ARCHITECTURE.md §3）：模块之间只允许依赖本包，不得互相 import repo。
package contracts

import (
	"context"
	"time"
)

// —— 认证上下文 ——

type Auth struct {
	UserID      string
	SessionID   string
	Email       string
	DisplayName string
	Locale      string
	CreatedAt   time.Time
}

type authCtxKey struct{}

func WithAuth(ctx context.Context, a Auth) context.Context {
	return context.WithValue(ctx, authCtxKey{}, a)
}

func AuthFrom(ctx context.Context) (Auth, bool) {
	a, ok := ctx.Value(authCtxKey{}).(Auth)
	return a, ok
}

// —— 角色 ——

type Role string

const (
	RoleOwner     Role = "owner"
	RoleCaregiver Role = "caregiver"
	RoleEditor    Role = "editor"
	RoleViewer    Role = "viewer"
	RoleReadOnly  Role = "read_only"
)

// —— 圈与成员 ——

type Family struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Timezone    string    `json:"timezone"`
	Role        Role      `json:"role"` // 请求者的角色（列表/详情视图）
	MemberCount int       `json:"member_count,omitempty"`
	PetCount    int       `json:"pet_count,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

type Member struct {
	UserID      string    `json:"user_id"`
	Email       string    `json:"email"`
	DisplayName string    `json:"display_name"`
	Role        Role      `json:"role"`
	JoinedAt    time.Time `json:"joined_at"`
}

// MembershipService 由 families 模块实现，供其他模块查询成员关系。
type MembershipService interface {
	// ActiveMember 返回用户在圈中的活跃成员关系；非成员返回 false。
	ActiveMember(ctx context.Context, familyID, userID string) (Member, bool, error)
	// FamilyOwner 返回圈主的 userID（配额按圈主权益定档，BACKEND-DESIGN D2）。
	FamilyOwner(ctx context.Context, familyID string) (string, error)
	// FamilyTimezone 返回圈时区。
	FamilyTimezone(ctx context.Context, familyID string) (string, error)
}

// —— 宠物（跨模块共享的只读视图）——

type Pet struct {
	ID        string   `json:"id"`
	FamilyIDs []string `json:"family_ids,omitempty"`
	// FamilyRoles keeps the user's role at each live Family-Pet edge. A Pet
	// can be shared by multiple Families, so a single aggregate access role
	// is not sufficient for scoped Today/Timeline actions.
	FamilyRoles map[string]Role `json:"family_roles,omitempty"`
	// PrimaryFamilyID 是 primary 边的家庭（转移接受后的目标家庭）；无
	// primary 边时为空。前端用于解链差异文案、转移页当前主家庭、
	// 时间线/Today 的宠物时区取主家庭。
	PrimaryFamilyID    string     `json:"primary_family_id,omitempty"`
	Name               string     `json:"name"`
	Species            string     `json:"species"`
	Breed              string     `json:"breed"`
	BirthDate          *time.Time `json:"birth_date,omitempty"`
	Sex                string     `json:"sex"`
	Neutered           bool       `json:"neutered"`
	WeightG            *int       `json:"weight_g,omitempty"`
	ArchivedAt         *time.Time `json:"archived_at,omitempty"`
	Version            int        `json:"version"`
	CreatedByUserID    string     `json:"created_by_user_id,omitempty"`
	CurrentOwnerUserID string     `json:"current_owner_user_id,omitempty"`
	AccessRole         string     `json:"access_role,omitempty"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

func (p Pet) Archived() bool { return p.ArchivedAt != nil }

// PetsGuard 由 pets 模块实现：资源访问的唯一权限路径（权限单点）。
// needOwner 要求圈主角色；mutable=true 时归档宠返回 PET_ARCHIVED。
type PetsGuard interface {
	RequirePet(ctx context.Context, petID string, needOwner, mutable bool) (Pet, Member, error)
	// RequirePetInTx repeats the same authorization after a caller-owned
	// transaction has locked the pet and its family.
	RequirePetInTx(ctx context.Context, q Q, petID, userID string, needOwner, mutable bool) (Pet, Member, error)
	// RequirePetRecordInTx is the stricter write gate for Pet identity,
	// medical profile, and medication records. Caregivers may execute assigned
	// care occurrences, but must not mutate the Pet's durable record.
	RequirePetRecordInTx(ctx context.Context, q Q, petID, userID string) (Pet, Member, error)
}

// —— 时间线事件来源（跨模块共享常量）——
// 用药/转移生成 auto 事件；用户手动记录为 user。抽至此包避免 meds/transfers 直接依赖 timeline 常量。
const (
	SourceUser         = "user"
	SourceAutoMed      = "auto:med"
	SourceAutoTransfer = "auto:transfer"
	SourceAutoCare     = "auto:care"
)

type Plan struct {
	Key          string
	Families     int   // 兼容旧 API；仍是 User 的家庭数量上限，不属于 Family
	Pets         int   // User 的活跃宠物上限（V2）
	Members      int   // ACL 防滥用上限；不是 Family 的资产/所有权配额
	StorageBytes int64 // User 的文件总量上限（V2）
	FileBytes    int64 // 单文件上限
	AIMonthly    int64 // User 的月度 AI 调用上限（V2）
}

// DefaultPlans：数据库 plans 表缺行时的兜底（fail-safe）。
// 运行时事实来源是 plans 表——调整限额改数据（planet-cli plans set），不改代码。
var DefaultPlans = map[string]Plan{
	// Multiple Families are part of the core User → Family model, not a
	// premium-only branch. Keep the default generous enough for a real user
	// with home, work, foster, or co-parenting contexts.
	// Multiple pets are part of the core User → Family → Pet model too.
	"free": {Key: "free", Families: 3, Pets: 5, Members: 2, StorageBytes: 50 << 20, FileBytes: 10 << 20},
	"pro":  {Key: "pro", Families: 3, Pets: 5, Members: 6, StorageBytes: 10 << 30, FileBytes: 50 << 20},
}

// EntitlementService 由 entitlements 模块实现。
type EntitlementService interface {
	// BestKey 返回用户当前最优权益 key（无权益返回 "free"）。
	BestKey(ctx context.Context, userID string) (string, error)
	Can(ctx context.Context, userID, key string) (bool, error)
	// PlanForEntitlement：权益 key → 档位限额（读 plans 表，缺行回退 DefaultPlans）。
	// '*'（founding）→ pro 档；未来新档位 = plans 表插行 + 对应权益 key，零代码变更。
	PlanForEntitlement(ctx context.Context, entitlementKey string) (Plan, error)
	UserPlan(ctx context.Context, userID string) (Plan, error)
	SetUsage(ctx context.Context, q Q, userID, resource, period string, used int64) error
}

// Usage 用于配额错误回显。
type Usage struct {
	Pets      int `json:"pets"`
	PetMax    int `json:"pet_max"`
	Members   int `json:"members"`
	MemberMax int `json:"member_max"`
}

// UserQuotaService 是所有 User-owned quota 写入的唯一契约。
// resource 的计数在调用方事务中完成，避免并发创建/转移超卖。
type UserQuotaService interface {
	UserPlan(ctx context.Context, userID string) (Plan, error)
	Reserve(ctx context.Context, q Q, userID, resource, period string, delta, limit int64) (int64, error)
	SetUsage(ctx context.Context, q Q, userID, resource, period string, used int64) error
}
