import type { TimelineEvent } from '../../core/api/planet-api'
import { formatInTimeZoneSafe } from './time'

export type TimelineRow =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'event'; key: string; event: TimelineEvent }

export function buildTimelineRows(
  events: TimelineEvent[],
  timezone: string | undefined,
  todayKey: string,
  yesterdayKey: string,
): TimelineRow[] {
  const groups = new Map<string, TimelineEvent[]>()
  for (const event of events) {
    const key = formatInTimeZoneSafe(event.occurred_at, timezone, 'yyyy-MM-dd')
    const list = groups.get(key) ?? []
    list.push(event)
    groups.set(key, list)
  }

  const rows: TimelineRow[] = []
  for (const [dateKey, group] of groups.entries()) {
    rows.push({
      kind: 'header',
      key: `header-${dateKey}`,
      label: groupHeading(dateKey, todayKey, yesterdayKey),
    })
    for (const event of group) {
      rows.push({ kind: 'event', key: event.id, event })
    }
  }
  return rows
}

function groupHeading(key: string, todayKey: string, yesterdayKey: string) {
  if (key === todayKey) return '今天'
  if (key === yesterdayKey) return '昨天'
  const parsed = new Date(`${key}T00:00:00`)
  return Number.isNaN(parsed.getTime())
    ? key
    : `${parsed.getMonth() + 1}月${parsed.getDate()}日`
}
