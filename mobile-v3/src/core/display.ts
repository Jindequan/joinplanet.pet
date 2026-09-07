// 展示助手：所有服务端枚举 → 用户可见中文文案的唯一映射位置。
// 页面不得内联第二套同类翻译，避免同一字段在不同页面叫法不一致。
import { tt, getLang } from "./i18n";

/** 日期/时间格式随界面语言走（zh→zh-CN，en→en-US）。
 *  历史上 5 处硬编码 zh-CN，英文模式下也输出中文格式。 */
function localeTag(): string {
  return getLang() === "en" ? "en-US" : "zh-CN";
}
export function formatDateTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString(localeTag());
}
export function formatDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString(localeTag());
}
export function formatTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleTimeString(localeTag(), { hour: "2-digit", minute: "2-digit" });
}
export { tt };

export function roleLabel(role: string | undefined): string {
  switch (role) {
    case "owner":
      return tt("圈主", "Owner");
    case "caregiver":
      return tt("照护者", "Caregiver");
    case "editor":
      return tt("可编辑", "Can edit");
    case "viewer":
      return tt("可查看", "Can view");
    case "read_only":
      return tt("只读", "Read-only");
    case "helper":
      return tt("协助人", "Helper");
    default:
      return role || tt("成员", "Member");
  }
}

export type CareSchedule = {
  kind?: string;
  interval?: number;
  every_n?: number;
  days?: number[];
  day?: number;
};

const WEEKDAY_ZH = ["一", "二", "三", "四", "五", "六", "日"];
const WEEKDAY_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** 把 care rule 的结构化 schedule 转成人话，例如「每周 一 · 09:00」。 */
export function ruleText(
  raw: CareSchedule | Record<string, unknown> | undefined | null,
  timeOfDay?: string,
): string {
  const schedule: CareSchedule =
    raw && typeof raw === "object" ? (raw as CareSchedule) : {};
  const kind = typeof schedule.kind === "string" ? schedule.kind : "";
  const weekdays = tt("zh", "en") === "en" ? WEEKDAY_EN : WEEKDAY_ZH;
  const joiner = tt("、", ", ");
  let cadence: string;
  if (kind === "daily") cadence = tt("每天", "Daily");
  else if (kind === "weekly") {
    const dayNames =
      schedule.days
        ?.map((day) => weekdays[Math.min(Math.max(day - 1, 0), 6)])
        .join(joiner) || "—";
    cadence = tt(`每周 ${dayNames}`, `Weekly on ${dayNames}`);
  } else if (kind === "monthly")
    cadence = tt(
      `每月 ${schedule.day ?? "?"} 日`,
      `Monthly on day ${schedule.day ?? "?"}`,
    );
  else if (kind === "interval") {
    const days =
      typeof schedule.interval === "number" ? schedule.interval : schedule.every_n;
    cadence = tt(`每 ${days} 天`, `Every ${days} days`);
  } else cadence = kind || tt("自定义", "Custom");
  return [cadence, timeOfDay].filter(Boolean).join(" · ");
}

export function carePlanTypeLabel(type: string | undefined): string {
  switch (type) {
    case "custom":
      return tt("自定义", "Custom");
    case "feeding":
      return tt("饮食", "Feeding");
    case "health":
      return tt("健康", "Health");
    case "grooming":
      return tt("清洁", "Grooming");
    case "exercise":
      return tt("运动", "Exercise");
    case "medication":
      return tt("用药", "Medication");
    default:
      return type || tt("自定义", "Custom");
  }
}

const SPECIES_META: Record<string, { glyph: string; hue: number }> = {
  dog: { glyph: "🐕", hue: 28 },
  cat: { glyph: "🐈", hue: 210 },
};

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1)
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  return hash;
}

/**
 * 宠物没有头像媒体契约时，用「物种图形 + 名字首字」的确定性装饰代替；
 * 同一只宠物在任何页面渲染一致，且不假装是用户上传的照片。
 */
export function petAvatarStyle(petId: string, species?: string) {
  const meta = SPECIES_META[species ?? ""] ?? { glyph: "🐾", hue: 150 };
  const hue = (meta.hue + (hashString(petId) % 24)) % 360;
  return {
    glyph: meta.glyph,
    background: `linear-gradient(135deg, hsl(${hue} 46% 90%), hsl(${(hue + 40) % 360} 42% 80%))`,
  };
}

export function speciesLabel(species: string | undefined): string {
  switch ((species ?? "").toLowerCase()) {
    case "dog":
      return tt("狗", "Dog");
    case "cat":
      return tt("猫", "Cat");
    default:
      return species || tt("未设置", "Not set");
  }
}

export function sexLabel(sex: string | undefined): string {
  switch (sex) {
    case "female":
      return tt("母", "Female");
    case "male":
      return tt("公", "Male");
    default:
      return tt("未设置", "Not set");
  }
}

/** 出生日期 → 「3 岁」；不足 1 岁显示月龄。 */
export function ageText(birthDate: string | undefined): string {
  if (!birthDate) return "";
  const birth = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return "";
  const now = new Date();
  let months =
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 1) return tt("未满月", "Under 1 month");
  if (months < 12) return tt(`${months} 个月`, `${months} mo`);
  return tt(`${Math.floor(months / 12)} 岁`, `${Math.floor(months / 12)} yr`);
}

export function weightKg(grams: number | undefined | null): string {
  if (typeof grams !== "number" || grams <= 0) return "";
  const kg = grams / 1000;
  return `${kg >= 10 ? Math.round(kg) : Math.round(kg * 10) / 10} kg`;
}

export function humanBytes(bytes: number | undefined): string {
  if (typeof bytes !== "number" || bytes <= 0) return "0";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${Math.round(value * 10) / 10} ${units[unit]}`;
}

/** Record 映射改为取值函数：tt() 在调用时求值，语言切换即时生效（导入期冻结会卡死旧语言）。 */
export function usageResourceLabel(key: string): string {
  switch (key) {
    case "ai_monthly":
      return tt("AI 用量（每月）", "AI Usage (Monthly)");
    case "pets_created":
      return tt("已创建宠物", "Pets Created");
    case "storage_bytes":
      return tt("存储空间", "Storage");
    default:
      return key.replaceAll("_", " ");
  }
}

export function transferStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return tt("待处理", "Pending");
    case "accepted":
      return tt("已接受", "Accepted");
    case "declined":
      return tt("已婉拒", "Declined");
    case "cancelled":
      return tt("已取消", "Cancelled");
    default:
      return status;
  }
}

export function taskStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return tt("待完成", "To do");
    case "completed":
      return tt("已完成", "Done");
    case "done":
      return tt("已完成", "Done");
    case "skipped":
      return tt("已跳过", "Skipped");
    case "missed":
      return tt("已过期", "Missed");
    default:
      return status;
  }
}

// ---------- 时区：用户不该手打 IANA 字符串 ----------

/** 精选常用时区（后端只接受合法 IANA 名，下拉从源头杜绝非法值）。 */
export const COMMON_TIMEZONES = [
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Macau",
  "Asia/Taipei",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Singapore",
  "Asia/Bangkok",
  "Asia/Kuala_Lumpur",
  "Asia/Jakarta",
  "Asia/Manila",
  "Asia/Ho_Chi_Minh",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Australia/Sydney",
  "Pacific/Auckland",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Vancouver",
  "America/Sao_Paulo",
  "UTC",
] as const;

/** 当前 UTC 偏移，如「UTC+8」；无法解析返回 null。 */
export function timezoneOffset(tz: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    }).formatToParts(new Date());
    const name =
      parts.find((part) => part.type === "timeZoneName")?.value ?? "";
    return name ? name.replace("GMT", "UTC") : null;
  } catch {
    return null;
  }
}

/** 完整展示：Asia/Shanghai（UTC+8）。 */
export function timezoneLabel(tz: string | undefined): string {
  if (!tz) return "";
  const offset = timezoneOffset(tz);
  return offset ? tt(`${tz}（${offset}）`, `${tz} (${offset})`) : tz;
}

/** 城市短名：Asia/Shanghai → Shanghai（下划线转空格）。 */
export function timezoneCity(tz: string | undefined): string {
  if (!tz) return "";
  return tz.split("/").pop()?.replaceAll("_", " ") ?? tz;
}

/** 下拉选项：常用表 + 注入当前值（兼容历史数据里的冷门时区）。 */
export function timezoneOptions(current?: string): string[] {
  const list: string[] = [...COMMON_TIMEZONES];
  if (current && !list.includes(current as (typeof COMMON_TIMEZONES)[number]))
    list.unshift(current);
  return list;
}
