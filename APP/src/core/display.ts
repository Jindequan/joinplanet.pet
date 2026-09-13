// 展示助手：所有服务端枚举 → 用户可见中文文案的唯一映射位置。
// 页面不得内联第二套同类翻译，避免同一字段在不同页面叫法不一致。

export { roleLabel } from './presentation/terminology'

export type CareSchedule = {
  kind?: string
  interval?: number
  every_n?: number
  days?: number[]
  day?: number
}

const WEEKDAY_ZH = ['一', '二', '三', '四', '五', '六', '日']

/** 把 care rule 的结构化 schedule 转成人话，例如「每周 一 · 09:00」。 */
export function ruleText(
  raw: CareSchedule | Record<string, unknown> | undefined | null,
  timeOfDay?: string,
): string {
  const schedule: CareSchedule =
    raw && typeof raw === 'object' ? (raw as CareSchedule) : {}
  const kind = typeof schedule.kind === 'string' ? schedule.kind : ''
  let cadence: string
  if (kind === 'daily') cadence = '每天'
  else if (kind === 'weekly')
    cadence = `每周 ${
      schedule.days
        ?.map((day) => WEEKDAY_ZH[Math.min(Math.max(day - 1, 0), 6)])
        .join('、') || '—'
    }`
  else if (kind === 'monthly') cadence = `每月 ${schedule.day ?? '?'} 日`
  else if (kind === 'interval')
    cadence = `每 ${
      typeof schedule.interval === 'number' ? schedule.interval : schedule.every_n
    } 天`
  else if (kind === 'once')
    cadence = `单次${typeof (schedule as { date?: string }).date === 'string' ? ` ${(schedule as { date?: string }).date}` : ''}`
  else cadence = kind || '自定义'
  return [cadence, timeOfDay].filter(Boolean).join(' · ')
}

export function carePlanTypeLabel(type: string | undefined): string {
  switch (type) {
    case 'custom':
      return '自定义'
    case 'feeding':
      return '饮食'
    case 'health':
      return '健康'
    case 'grooming':
      return '清洁'
    case 'exercise':
      return '运动'
    case 'medication':
      return '定点给药'
    default:
      return type || '自定义'
  }
}

const SPECIES_META: Record<string, { glyph: string; hue: number }> = {
  dog: { glyph: '🐕', hue: 28 },
  cat: { glyph: '🐈', hue: 210 },
}

function hashString(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1)
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  return hash
}

/**
 * 宠物没有头像媒体契约时，用「物种图形 + 名字首字」的确定性装饰代替；
 * 同一只宠物在任何页面渲染一致，且不假装是用户上传的照片。
 * RN：返回双色数组，供 LinearGradient / 手动混色使用。
 */
export function petAvatarStyle(petId: string, species?: string) {
  const meta = SPECIES_META[species ?? ''] ?? { glyph: '🐾', hue: 150 }
  const hue = (meta.hue + (hashString(petId) % 24)) % 360
  return {
    glyph: meta.glyph,
    backgroundColors: [
      `hsl(${hue} 46% 90%)`,
      `hsl(${(hue + 40) % 360} 42% 80%)`,
    ] as [string, string],
  }
}

export function speciesLabel(species: string | undefined): string {
  switch ((species ?? '').toLowerCase()) {
    case 'dog':
      return '狗'
    case 'cat':
      return '猫'
    case 'other':
      return '其他'
    default:
      return species || '未设置'
  }
}

/** YYYY-MM-DD → 「2026年8月29日」；非法值原样返回。 */
export function civilDateLabel(value: string | undefined | null): string {
  if (!value) return ''
  const [year, month, day] = value.split('-')
  if (!year || !month || !day) return value
  return `${Number(year)}年${Number(month)}月${Number(day)}日`
}

export function sexLabel(sex: string | undefined): string {
  switch (sex) {
    case 'female':
      return '母'
    case 'male':
      return '公'
    default:
      return '未设置'
  }
}

/** 出生日期 → 「3 岁」；不足 1 岁显示月龄。 */
export function ageText(birthDate: string | undefined): string {
  if (!birthDate) return ''
  const birth = new Date(`${birthDate}T00:00:00`)
  if (Number.isNaN(birth.getTime())) return ''
  const now = new Date()
  let months =
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth())
  if (now.getDate() < birth.getDate()) months -= 1
  if (months < 1) return '未满月'
  if (months < 12) return `${months} 个月`
  return `${Math.floor(months / 12)} 岁`
}

export function weightKg(grams: number | undefined | null): string {
  if (typeof grams !== 'number' || grams <= 0) return ''
  const kg = grams / 1000
  return `${kg >= 10 ? Math.round(kg) : Math.round(kg * 10) / 10} kg`
}

export function humanBytes(bytes: number | undefined): string {
  if (typeof bytes !== 'number' || bytes <= 0) return '0'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${Math.round(value * 10) / 10} ${units[unit]}`
}

export const USAGE_RESOURCE_LABELS: Record<string, string> = {
  ai_monthly: 'AI 用量（每月）',
  pets_created: '已创建宠物',
  storage_bytes: '存储空间',
}

export const TRANSFER_STATUS_LABELS: Record<string, string> = {
  pending: '待处理',
  accepted: '已接受',
  declined: '已婉拒',
  cancelled: '已取消',
}

export const TASK_STATUS_LABELS: Record<string, string> = {
  pending: '待完成',
  completed: '已完成',
  done: '已完成',
  skipped: '已跳过',
  missed: '已过期',
}

// ---------- 时区：用户不该手打 IANA 字符串 ----------

/** 精选常用时区（后端只接受合法 IANA 名，下拉从源头杜绝非法值）。 */
export const COMMON_TIMEZONES = [
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Macau',
  'Asia/Taipei',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Singapore',
  'Asia/Bangkok',
  'Asia/Kuala_Lumpur',
  'Asia/Jakarta',
  'Asia/Manila',
  'Asia/Ho_Chi_Minh',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Australia/Sydney',
  'Pacific/Auckland',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Vancouver',
  'America/Sao_Paulo',
  'UTC',
] as const

/** 当前 UTC 偏移，如「UTC+8」；无法解析返回 null。 */
export function timezoneOffset(tz: string): string | null {
  // 数值法计算偏移：Hermes 对 timeZoneName:'shortOffset' 支持不全（会返回裸 GMT）。
  try {
    const now = new Date()
    now.setSeconds(0, 0)
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(now)
    const get = (type: string) =>
      Number(parts.find((part) => part.type === type)?.value ?? NaN)
    const hour = get('hour')
    const wallUtc = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      hour === 24 ? 0 : hour,
      get('minute'),
    )
    if (!Number.isFinite(wallUtc)) return null
    const offsetMin = Math.round((wallUtc - now.getTime()) / 60_000)
    if (offsetMin === 0) return 'UTC'
    const sign = offsetMin > 0 ? '+' : '-'
    const abs = Math.abs(offsetMin)
    const h = Math.floor(abs / 60)
    const m = abs % 60
    return `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`
  } catch {
    return null
  }
}

/** 完整展示：Asia/Shanghai（UTC+8）。 */
export function timezoneLabel(tz: string | undefined): string {
  if (!tz) return ''
  const offset = timezoneOffset(tz)
  return offset ? `${tz}（${offset}）` : tz
}

/** 城市短名：Asia/Shanghai → Shanghai（下划线转空格）。 */
export function timezoneCity(tz: string | undefined): string {
  if (!tz) return ''
  return tz.split('/').pop()?.replaceAll('_', ' ') ?? tz
}

/** 下拉选项：常用表 + 注入当前值（兼容历史数据里的冷门时区）。 */
export function timezoneOptions(current?: string): string[] {
  const list: string[] = [...COMMON_TIMEZONES]
  if (current && !list.includes(current as (typeof COMMON_TIMEZONES)[number]))
    list.unshift(current)
  return list
}
