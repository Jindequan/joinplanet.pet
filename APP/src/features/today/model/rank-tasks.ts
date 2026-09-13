import type { Task, TaskLog } from '../../../core/api/planet-api'
import { isCareOpen, isCareResolved } from '../../../core/presentation/care-status'

export type RankableTodayItem = {
  task: Task
  log: TaskLog | null
  petName: string
  familyId?: string
}

function timeScore(timeOfDay?: string): number {
  if (!timeOfDay) return 12 * 60
  const parts = timeOfDay.split(':').map(Number)
  const h = parts[0]
  const m = parts[1]
  if (h === undefined || !Number.isFinite(h)) return 12 * 60
  return h * 60 + (m !== undefined && Number.isFinite(m) ? m : 0)
}

export function rankTodayItems<T extends RankableTodayItem>(
  items: T[],
  opts: {
    civilToday: string
    currentUserId?: string
    onDutyPetIds?: Set<string>
    civilTodayForItem?: (item: T) => string
  },
): T[] {
  const pending = items.filter(isCareOpen)
  const done = items.filter(isCareResolved)

  const sortedPending = [...pending].sort((a, b) => {
    const aOverdue = Boolean(a.task.due_date && a.task.due_date < (opts.civilTodayForItem?.(a) ?? opts.civilToday))
    const bOverdue = Boolean(b.task.due_date && b.task.due_date < (opts.civilTodayForItem?.(b) ?? opts.civilToday))
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1

    const aMine = opts.currentUserId && a.task.assigned_to_user_id === opts.currentUserId
    const bMine = opts.currentUserId && b.task.assigned_to_user_id === opts.currentUserId
    if (Boolean(aMine) !== Boolean(bMine)) return aMine ? -1 : 1

    const aDuty = opts.onDutyPetIds?.has(a.task.pet_id)
    const bDuty = opts.onDutyPetIds?.has(b.task.pet_id)
    if (Boolean(aDuty) !== Boolean(bDuty)) return aDuty ? -1 : 1

    const timeDiff = timeScore(a.task.time_of_day) - timeScore(b.task.time_of_day)
    if (timeDiff !== 0) return timeDiff

    return a.task.title.localeCompare(b.task.title, 'zh-CN')
  })

  return [...sortedPending, ...done]
}

export function pickFeaturedItem<T extends RankableTodayItem>(ranked: T[], preferredTaskId?: string): T | null {
  if (preferredTaskId) {
    const preferred = ranked.find((item) => item.task.id === preferredTaskId && isCareOpen(item))
    if (preferred) return preferred
  }
  return ranked.find(isCareOpen) ?? null
}
