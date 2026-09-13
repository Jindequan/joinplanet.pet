/** Today backfill / historical view boundaries — single source of truth. */

export const BACKFILL_ACTIONABLE_DAYS = 7
export const HISTORY_VIEW_DAYS = 30

export function earliestViewDate(civilToday: string): string {
  const parsed = new Date(`${civilToday}T12:00:00`)
  parsed.setDate(parsed.getDate() - HISTORY_VIEW_DAYS)
  return parsed.toISOString().slice(0, 10)
}

export function earliestActionableDate(civilToday: string): string {
  const parsed = new Date(`${civilToday}T12:00:00`)
  parsed.setDate(parsed.getDate() - BACKFILL_ACTIONABLE_DAYS)
  return parsed.toISOString().slice(0, 10)
}

export function isDateActionable(targetDate: string, civilToday: string): boolean {
  if (!targetDate) return true
  const earliest = earliestActionableDate(civilToday)
  return targetDate >= earliest && targetDate <= civilToday
}

export function isDateSelectable(targetDate: string, civilToday: string): boolean {
  if (!targetDate) return true
  const earliest = earliestViewDate(civilToday)
  return targetDate >= earliest && targetDate <= civilToday
}
