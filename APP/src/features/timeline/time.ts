import { pad2 } from '../../core/time/civil'

/** datetime-local string (yyyy-MM-dd'T'HH:mm) in timezone, or device local. */
export function dateTimeLocalInTimezone(value: string | Date, timezone?: string): string {
  const date = typeof value === 'string' ? new Date(value) : value
  if (!timezone) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  }
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date)
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? '00'
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
  } catch {
    return dateTimeLocalInTimezone(date)
  }
}

/** Interpret a civil datetime-local string as an instant in the given timezone. */
export function instantFromCivilDateTime(value: string, timezone?: string): string {
  if (!timezone) return new Date(value).toISOString()
  try {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value)
    if (!match) return new Date(value).toISOString()
    const [, y, mo, d, h, mi] = match
    const asUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi))
    const probe = new Date(asUtc)
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(probe)
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value ?? 0)
    const asLocal = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
    const offsetMs = asLocal - asUtc
    return new Date(asUtc - offsetMs).toISOString()
  } catch {
    return new Date(value).toISOString()
  }
}

/** Format an instant in timezone; falls back to device local. Supports yyyy-MM-dd. */
export function formatInTimeZoneSafe(
  value: string | Date,
  timezone: string | undefined,
  pattern: string,
): string {
  const date = typeof value === 'string' ? new Date(value) : value
  if (pattern === 'yyyy-MM-dd') {
    if (!timezone) {
      return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
    }
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date)
    } catch {
      return formatInTimeZoneSafe(date, undefined, pattern)
    }
  }
  return date.toISOString()
}

/** Format an instant's clock time in the active family timezone. */
export function formatClockInTimeZoneSafe(value: string | Date, timezone?: string): string {
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ''
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(date)
  } catch {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
}
