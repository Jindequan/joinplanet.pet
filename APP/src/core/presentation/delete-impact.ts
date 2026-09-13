import type { TimelineEvent } from '../api/planet-api'

const CARE_TYPES = new Set([
  'care_task_completed',
  'care_task_skipped',
  'care_occurrence',
])

export function timelineDeleteTitle(type: string, category: string): string {
  return `删除这条${category}记录？`
}

export function timelineDeleteConsequence(event: TimelineEvent): string {
  if (CARE_TYPES.has(event.type)) {
    return '删除后，对应的照护完成状态可能回到待办；趋势统计会一并更新。'
  }
  if (event.type === 'weight') {
    return '删除后，体重趋势与档案摘要可能变化。'
  }
  return '删除后无法恢复；成员将不再看到这条记录。'
}
