package contracts

import (
	"context"
	"encoding/json"
	"time"
)

// —— 宠物档案（跨模块共享；pets 模块以别名复用）——

type Profile struct {
	Allergies         json.RawMessage `json:"allergies"`
	Conditions        json.RawMessage `json:"conditions"`
	EmergencyContacts json.RawMessage `json:"emergency_contacts"`
	MedDecisionMaker  json.RawMessage `json:"med_decision_maker,omitempty"`
	Notes             string          `json:"notes"`
	UpdatedAt         time.Time       `json:"updated_at"`
}

// —— 分享视图的最小只读数据（sharing 模块经这些接口取数，禁止直达他模块 repo）——

type SharedMed struct {
	Name      string     `json:"name"`
	Dose      string     `json:"dose"`
	Schedule  string     `json:"schedule"`
	StartedOn time.Time  `json:"started_on"`
	EndedOn   *time.Time `json:"ended_on,omitempty"`
}

type SharedEvent struct {
	Type       string          `json:"type"`
	OccurredAt time.Time       `json:"occurred_at"`
	Source     string          `json:"source"`
	Payload    json.RawMessage `json:"payload"`
}

type SharedTodayItem struct {
	Title      string  `json:"title"`
	TimeOfDay  *string `json:"time_of_day,omitempty"`
	LogStatus  *string `json:"log_status,omitempty"`
	DoneByName *string `json:"done_by_name,omitempty"`
}

type SharedTodayGroup struct {
	PetID    string            `json:"pet_id"`
	PetName  string            `json:"pet_name"`
	Items    []SharedTodayItem `json:"items"`
	Timezone string            `json:"-"` // persisted task timezone; not part of the public card
}

// PetReader：sharing/导出用（无成员判定；调用方已完成授权）。
type PetReader interface {
	GetForShare(ctx context.Context, petID string) (Pet, Profile, error)
}

type MedsReader interface {
	ListForShare(ctx context.Context, petID string) ([]SharedMed, error)
}

type EventReader interface {
	ListForShare(ctx context.Context, petID string, sinceDays, limit int) ([]SharedEvent, error)
}

type TodayReader interface {
	TodayForShare(ctx context.Context, familyID string, now time.Time) ([]SharedTodayGroup, error)
	TodayForPetShare(ctx context.Context, petID string, now time.Time) ([]SharedTodayGroup, error)
}
