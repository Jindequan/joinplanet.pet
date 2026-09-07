import { z } from "zod";
import { tt } from "../../core/i18n";

const textPayload = z
  .object({ title: z.string().optional(), detail: z.string().optional(), text: z.string().optional(), summary: z.string().optional() })
  .passthrough();
const weightPayload = z
  .object({ weight_g: z.number().positive(), note: z.string().optional() })
  .passthrough();
const vaccinePayload = z
  .object({ name: z.string().min(1), due: z.string().optional() })
  .passthrough();
const medicationPayload = z
  .object({ name: z.string(), action: z.enum(["started", "ended"]), medication_id: z.string() })
  .passthrough();
const careLogPayload = z
  .object({ title: z.string(), status: z.string() })
  .passthrough();

/** source=user 的手动记录可编辑；auto:* 的系统事实由服务端产生，前端只读。 */
export const eventRegistry = {
  note: { schema: textPayload, editable: true, deletable: true },
  symptom: { schema: textPayload, editable: true, deletable: true },
  weight: { schema: weightPayload, editable: true, deletable: true },
  vet_visit: { schema: textPayload, editable: true, deletable: true },
  vaccine: { schema: vaccinePayload, editable: true, deletable: true },
  // —— 系统自动事实：只展示 ——
  medication: { schema: medicationPayload, editable: false, deletable: false },
  care_task_completed: { schema: careLogPayload, editable: false, deletable: false },
  care_task_undone: { schema: careLogPayload, editable: false, deletable: false },
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
  icon: "pill" | "syringe" | "weight" | "stethoscope" | "symptom" | "note" | "care" | "undo" | "generic";
  /** 正文主文本。 */
  headline?: string;
  /** 次要说明行。 */
  detail?: string;
};

/** Record 映射改为取值函数：tt() 在调用时求值，避免模块导入期冻结语言。 */
function eventCategory(type: string): string {
  switch (type) {
    case "note":
      return tt("笔记", "Note");
    case "symptom":
      return tt("症状", "Symptom");
    case "weight":
      return tt("体重", "Weight");
    case "vet_visit":
      return tt("就诊", "Vet Visit");
    case "vaccine":
      return tt("疫苗", "Vaccine");
    case "medication":
      return tt("用药", "Medication");
    case "care_task_completed":
    case "care_task_undone":
      return tt("照护", "Care");
    default:
      return type;
  }
}

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
        return { category: tt("停药", "Medication Ended"), icon: "pill", headline: name };
      if (action === "started")
        return { category: tt("开始用药", "Medication Started"), icon: "pill", headline: name };
      return { category: eventCategory("medication"), icon: "pill", headline: name || undefined };
    }
    case "care_task_completed": {
      if (str("status") === "skipped")
        return { category: tt("已跳过", "Skipped"), icon: "care", headline: str("title") };
      return { category: tt("完成照护", "Care Completed"), icon: "care", headline: str("title") };
    }
    case "care_task_undone":
      return { category: tt("撤销记录", "Record Undone"), icon: "undo", headline: str("title") };
    case "weight": {
      const grams = typeof data.weight_g === "number" ? data.weight_g : undefined;
      // 统一保留两位小数（12.5 kg）：整数取整曾让 ≥10kg 的卡片与变化量、趋势页三处精度打架。
      const kg = grams !== undefined ? `${Math.round((grams / 1000) * 100) / 100} kg` : undefined;
      return { category: tt("体重", "Weight"), icon: "weight", headline: kg ?? str("note"), detail: grams === undefined ? undefined : str("note") };
    }
    case "vaccine":
      return {
        category: tt("疫苗", "Vaccine"),
        icon: "syringe",
        headline: str("name"),
        detail: str("due") ? tt(`下次到期 ${str("due")}`, `Next due ${str("due")}`) : str("text"),
      };
    case "vet_visit":
      return {
        category: tt("就诊", "Vet Visit"),
        icon: "stethoscope",
        headline: str("title"),
        detail: joined(str("clinic"), str("summary")),
      };
    case "symptom":
      return {
        category: tt("症状", "Symptom"),
        icon: "symptom",
        headline: str("title"),
        detail: str("detail"),
      };
    case "note":
      return { category: tt("笔记", "Note"), icon: "note", headline: str("text") ?? str("title"), detail: str("detail") };
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
