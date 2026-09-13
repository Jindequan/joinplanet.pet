/** Pad a number to two digits: 3 → "03". */
export function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** Local civil date YYYY-MM-DD (browser / device timezone). */
export function localCivilDate(date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** Today as YYYY-MM-DD in the device local timezone. */
export function civilToday(): string {
  return localCivilDate(new Date())
}

/**
 * Format a date as YYYY-MM-DD in the given IANA timezone.
 * Falls back to local civil date when timezone is missing or invalid.
 */
export function civilDateInTimezone(
  timezone: string | undefined,
  date = new Date(),
): string {
  if (!timezone) return localCivilDate(date)
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  } catch {
    return localCivilDate(date)
  }
}

/** Format an instant in the family's authoritative timezone for care cards. */
export function formatCareInstant(
  value: string | Date,
  timezone: string | undefined,
  includeDate = true,
): string {
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '时间未定'
  try {
    return new Intl.DateTimeFormat([], {
      timeZone: timezone,
      ...(includeDate ? { month: 'numeric', day: 'numeric' } : {}),
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  } catch {
    return new Intl.DateTimeFormat([], {
      ...(includeDate ? { month: 'numeric', day: 'numeric' } : {}),
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  }
}

/** Format a server civil date without shifting it through device UTC. */
export function formatCareCivilDate(value: string | undefined | null): string {
  if (!value) return '日期未定'
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return value
  return `${Number(match[2])}月${Number(match[3])}日`
}

/** Interpret a civil datetime in an IANA timezone as an instant. */
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
