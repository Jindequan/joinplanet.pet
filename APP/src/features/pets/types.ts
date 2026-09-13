/** Care-plan list rows expose schedule/status beyond the Task alias. */
export type CarePlanRow = {
  id: string
  family_id?: string
  care_rule_id?: string
  title: string
  type?: string
  description?: string
  status?: 'active' | 'paused' | 'archived' | string
  schedule?: Record<string, unknown>
  time_of_day?: string
  timezone?: string
  due_at?: string
  due_date?: string
  assigned_to_user_id?: string
}

export type CareTemplate = {
  key: string
  title: string
  type: 'feeding' | 'exercise' | 'medication' | 'health' | 'grooming' | 'custom'
  rule: { type: 'daily' | 'weekly' | 'monthly' | 'interval'; time: string; days?: number[] }
}

/** 常见照护：点一下预填，确认后创建。 */
export const CARE_TEMPLATES: CareTemplate[] = [
  { key: 'feed-am', title: '早餐', type: 'feeding', rule: { type: 'daily', time: '08:00' } },
  { key: 'feed-pm', title: '晚餐', type: 'feeding', rule: { type: 'daily', time: '18:30' } },
  { key: 'water', title: '喂水', type: 'feeding', rule: { type: 'daily', time: '10:00' } },
  { key: 'treat', title: '零食', type: 'feeding', rule: { type: 'daily', time: '15:00' } },
  { key: 'walk', title: '遛弯', type: 'exercise', rule: { type: 'daily', time: '19:00' } },
  { key: 'bath', title: '洗澡', type: 'grooming', rule: { type: 'weekly', time: '10:00', days: [6] } },
  { key: 'med', title: '定点给药', type: 'medication', rule: { type: 'daily', time: '08:00' } },
  { key: 'supplement', title: '补剂', type: 'health', rule: { type: 'daily', time: '08:30' } },
  { key: 'weigh', title: '称重', type: 'health', rule: { type: 'weekly', time: '09:00', days: [1] } },
  { key: 'checkup', title: '体检', type: 'health', rule: { type: 'monthly', time: '09:00' } },
]

export type PetWorkspaceTab = 'overview' | 'care'
