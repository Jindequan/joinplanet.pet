/**
 * PLANET 客户端地基契约（稳定面）
 *
 * 延伸功能（分享、趋势、接力等）只依赖本文件声明的类型与入口，
 * 不直接耦合 planet-api 的完整 surface，避免上层业务反向拖动地基形态。
 *
 * 规范：docs/FOUNDATION.md
 */

import type {
  Family,
  Pet,
  Profile,
  Task,
  TaskLog,
  TimelineEvent,
  Today,
} from '../api/planet-api'

/** L0 — 协作：谁在一起 */
export type FoundationFamily = Pick<Family, 'id' | 'name' | 'timezone'>

/** L2 — 宝贝：资产摘要（列表/切换） */
export type FoundationPetSummary = Pick<
  Pet,
  'id' | 'name' | 'species' | 'archived_at' | 'family_ids'
>

/** L1 — 呵护：今日一行 */
export type FoundationTodayRow = {
  task: Task
  log: TaskLog | null
  petId: string
  petName: string
  petSpecies?: string
}

/** L2 — 一生：时间线一条事实 */
export type FoundationTimelineEvent = TimelineEvent

/** L1 — Today 查询参数（与后端一致，冻结） */
export type FoundationTodayQuery = {
  date?: string
  family_id?: string
  pet_id?: string
}

/** L2 — Timeline 列表参数（与后端一致，冻结） */
export type FoundationTimelineQuery = {
  limit?: number
  family_id?: string
  pet_id?: string
  before?: string
  before_id?: string
}

/** L1 — 排程例外 / 继承链写（Phase D） */
export type FoundationScheduleActionInput = {
  action: import('../api/planet-api').ScheduleAction
  scope: import('../api/planet-api').ScheduleActionScope
  slot?: {
    care_rule_id?: string
    care_plan_id?: string
    date?: string
  }
  payload?: Record<string, unknown>
  idempotencyKey: string
  petId?: string
}

/** L1 — 完成/跳过（写地基） */
export type FoundationCompleteCareInput = {
  taskId: string
  status: 'done' | 'skipped'
  date?: string
  note?: string
  idempotencyKey: string
}

/** L2 — 手动写事实（写地基） */
export type FoundationWriteEventInput = {
  petId: string
  familyId?: string
  type: string
  occurred_at: string
  payload: Record<string, unknown>
  idempotencyKey?: string
}

/** L2 — 编辑事实 */
export type FoundationUpdateEventInput = {
  eventId: string
  petId?: string
  occurred_at: string
  payload: Record<string, unknown>
}

/**
 * 地基只读端口 — 延伸层通过 adapter 实现或消费服务端数据。
 * App 内默认由 planetApi + React Query 实现，不暴露给 feature 以外直连 fetch。
 */
export type FoundationReaders = {
  today: (query?: FoundationTodayQuery) => Promise<Today>
  timeline: (query: FoundationTimelineQuery) => Promise<{ events: TimelineEvent[]; next_cursor?: { before: string; before_id: string } }>
  accessiblePets: () => Promise<{ pets: Pet[] }>
  families: () => Promise<{ families: Family[] }>
  pet: (petId: string) => Promise<{ pet: Pet; profile: Profile }>
}

/**
 * 地基写端口 — 所有变更型操作经此汇总，保证幂等与 invalidate 一致。
 */
export type FoundationWriters = {
  completeCare: (input: FoundationCompleteCareInput) => Promise<{ log: import('../api/planet-api').TaskLog }>
  undoCare: (logId: string, idempotencyKey?: string) => Promise<void>
  applyScheduleAction: (
    input: FoundationScheduleActionInput,
  ) => Promise<import('../api/planet-api').ScheduleActionResponse>
  writeTimelineEvent: (input: FoundationWriteEventInput) => Promise<TimelineEvent>
  updateTimelineEvent: (input: FoundationUpdateEventInput) => Promise<TimelineEvent>
  deleteTimelineEvent: (eventId: string, petId?: string) => Promise<void>
}

/** 延伸层可订阅的地基事件（未来 relay / digest 用），不替代 Pet Event */
export type FoundationDomainEvent =
  | { type: 'care.completed'; petId: string; taskId: string; logId: string }
  | { type: 'care.undone'; petId: string; taskId: string }
  | { type: 'timeline.written'; petId: string; eventId: string }
  | { type: 'pet.changed'; petId: string }
