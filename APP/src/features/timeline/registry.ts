import { z } from "zod";

// One timeline event intentionally carries one compressed thumbnail in V1.
// Keep this below the API's 1 MiB JSON body limit while allowing normal phone
// photos to survive selection instead of rejecting almost every original.
export const MAX_PHOTO_DATA_BYTES = 768 * 1024;

const textPayload = z
  .object({
    title: z.string().optional(),
    detail: z.string().optional(),
    text: z.string().optional(),
    summary: z.string().optional(),
  })
  .passthrough();
const weightPayload = z
  .object({ weight_g: z.number().positive(), note: z.string().optional() })
  .passthrough();
const vaccinePayload = z
  .object({ name: z.string().min(1), due: z.string().optional() })
  .passthrough();
const medicationPayload = z
  .object({
    name: z.string(),
    action: z.enum(["started", "ended"]),
    medication_id: z.string(),
  })
  .passthrough();
const careLogPayload = z
  .object({ title: z.string(), status: z.string() })
  .passthrough();

/** source=user 的手动记录可编辑；auto:* 的系统事实由服务端产生，前端只读。 */
export const eventRegistry = {
  note: { schema: textPayload, editable: true, deletable: true },
  photo: {
    schema: z
      .object({ photo_data: z.string().min(1), caption: z.string().optional() })
      .passthrough(),
    editable: true,
    deletable: true,
  },
  symptom: { schema: textPayload, editable: true, deletable: true },
  weight: { schema: weightPayload, editable: true, deletable: true },
  vet_visit: { schema: textPayload, editable: true, deletable: true },
  vaccine: { schema: vaccinePayload, editable: true, deletable: true },
  deworm: { schema: vaccinePayload, editable: true, deletable: true },
  // —— 系统自动事实：只展示 ——
  medication: { schema: medicationPayload, editable: false, deletable: false },
  care_task_completed: {
    schema: careLogPayload,
    editable: false,
    deletable: false,
  },
  care_task_undone: {
    schema: careLogPayload,
    editable: false,
    deletable: false,
  },
} as const;

export function parseEventPayload(type: string, payload: unknown) {
  const definition = eventRegistry[type as keyof typeof eventRegistry];
  if (!definition) return { kind: "unknown" as const, payload };
  const parsed = definition.schema.safeParse(payload);
  return parsed.success
    ? { kind: "known" as const, payload: parsed.data }
    : { kind: "unknown" as const, payload };
}

export function isManualEvent(source: string | undefined): boolean {
  return source === "user";
}

export type EventDescription = {
  /** 卡片主标题（分类），如「体重」「用药」。 */
  category: string;
  /** 图标标识，用于选择图标组件。 */
  icon:
    | "pill"
    | "syringe"
    | "weight"
    | "stethoscope"
    | "symptom"
    | "note"
    | "camera"
    | "care"
    | "undo"
    | "generic";
  /** 正文主文本。 */
  headline?: string;
  /** 次要说明行。 */
  detail?: string;
};

const EVENT_CATEGORY: Record<string, string> = {
  note: "笔记",
  photo: "照片",
  symptom: "症状",
  weight: "体重",
  vet_visit: "就诊",
  vaccine: "疫苗",
  deworm: "驱虫",
  medication: "用药",
  care_task_completed: "照护",
  care_task_undone: "照护",
};

function joined(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" · ");
}

/** 把一条事件的 payload 映射成可读文案；未知类型安全降级为通用卡片。 */
export function describeEvent(
  type: string,
  payload: Record<string, unknown> | undefined | null,
): EventDescription {
  const data = (payload ?? {}) as Record<string, unknown>;
  const str = (key: string) => {
    const value = data[key];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  };
  switch (type) {
    case "medication": {
      const action = str("action");
      const name = str("name") ?? "";
      if (action === "ended")
        return { category: "停药", icon: "pill", headline: name };
      if (action === "started")
        return { category: "开始用药", icon: "pill", headline: name };
      return {
        category: EVENT_CATEGORY.medication ?? "用药",
        icon: "pill",
        headline: name || undefined,
      };
    }
    case "care_task_completed": {
      if (str("status") === "skipped")
        return { category: "已跳过", icon: "care", headline: str("title") };
      return { category: "完成照护", icon: "care", headline: str("title") };
    }
    case "care_task_undone":
      return { category: "撤销记录", icon: "undo", headline: str("title") };
    case "weight": {
      const grams =
        typeof data.weight_g === "number" ? data.weight_g : undefined;
      const kg =
        grams !== undefined
          ? `${grams >= 10000 ? Math.round(grams / 1000) : Math.round((grams / 1000) * 100) / 100} kg`
          : undefined;
      return {
        category: "体重",
        icon: "weight",
        headline: kg ?? str("note"),
        detail: grams === undefined ? undefined : str("note"),
      };
    }
    case "vaccine":
      return {
        category: "疫苗",
        icon: "syringe",
        headline: str("name"),
        detail: str("due") ? `下次到期 ${str("due")}` : str("text"),
      };
    case "deworm":
      return {
        category: "驱虫",
        icon: "pill",
        headline: str("name"),
        detail: str("due") ? `下次到期 ${str("due")}` : str("text"),
      };
    case "vet_visit":
      return {
        category: "就诊",
        icon: "stethoscope",
        headline: str("title"),
        detail: joined(str("clinic"), str("summary")),
      };
    case "symptom":
      return {
        category: "症状",
        icon: "symptom",
        headline: str("title"),
        detail: str("detail"),
      };
    case "note":
      return {
        category: "笔记",
        icon: "note",
        headline: str("text") ?? str("title"),
        detail: str("detail"),
      };
    case "photo":
      return {
        category: "照片",
        icon: "camera",
        headline: str("caption") ?? "一张新照片",
      };
    default: {
      // 未知类型：过滤掉内部 id 字段后安全展示，绝不让页面崩溃。
      const extras = Object.entries(data)
        .filter(([key]) => !key.endsWith("_id") && key !== "dedupe")
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join(" · ");
      return {
        category: type.replaceAll("_", " "),
        icon: "generic",
        headline: extras || undefined,
      };
    }
  }
}
