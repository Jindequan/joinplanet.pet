import { tt } from "../i18n";

export type ApiErrorShape = {
  status: number;
  code: string;
  message: string;
  requestId?: string;
  current?: unknown;
  log?: unknown;
  usage?: unknown;
  retryAfterSeconds?: number;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly current?: unknown;
  readonly log?: unknown;
  readonly usage?: unknown;
  readonly retryAfterSeconds?: number;

  constructor(shape: ApiErrorShape) {
    super(shape.message);
    this.name = "ApiError";
    this.status = shape.status;
    this.code = shape.code;
    this.requestId = shape.requestId;
    this.current = shape.current;
    this.log = shape.log;
    this.usage = shape.usage;
    this.retryAfterSeconds = shape.retryAfterSeconds;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

// 错误码 → 文案 的第一层映射。code 是后端冻结契约（只增不改），
// 比 message 正则可靠；下方 message 正则表作为未登记 code 的兜底。
// 结构: [zh, en]，tt() 在调用时求值。
const CODE_MESSAGES: Record<string, [string, string]> = {
  TASK_LOG_EXISTS: ["这条记录家人已经记过了", "A family member already logged this record"],
  PET_ARCHIVED: ["宠物已归档，处于只读状态", "This pet is archived and read-only"],
  CARE_PLAN_ARCHIVED: ["这个照护计划已归档，不能再操作", "This care plan is archived and can't be changed"],
  CARE_ASSIGNMENT_OWNER_REQUIRED: ["计划至少要保留一位负责人", "The plan must keep at least one owner assignment"],
  LAST_OWNER: ["圈主不能直接退出，请先转让圈主", "The owner can't leave directly. Transfer ownership first"],
  ALREADY_MEMBER: ["你已经是这个家庭的成员", "You're already a member of this family"],
  FAMILY_NOT_EMPTY: ["家庭里还有宠物——先把它们转移或解除链接", "This family still has pets — transfer them or unlink them first"],
  ACCOUNT_HAS_OWNED_PETS: ["还有活跃宠物需要先转移或删除", "Transfer or delete your active pets first"],
  UNDO_WINDOW_EXPIRED: ["超过 7 天的记录不能撤销", "Records older than 7 days can no longer be undone"],
  IDEMPOTENCY_KEY_REUSED: ["这个操作已在处理中，请刷新后重试", "This action is already being processed. Refresh and try again"],
  IDEMPOTENCY_REPLAY_SECRET_UNAVAILABLE: ["原始结果无法找回，请刷新查看最新状态", "The original result can't be recovered. Refresh to see the latest state"],
  TRANSFER_PENDING_EXISTS: ["这只宠物已有一笔进行中的转移", "This pet already has a pending transfer"],
  TRANSFER_CONFLICT: ["宠物的归属刚发生了变化，请刷新后重试", "The pet's placement just changed. Refresh and try again"],
  TRANSFER_NOT_PENDING: ["这笔转移已经被处理过了", "This transfer has already been resolved"],
  AUTO_EVENT_IMMUTABLE: ["系统自动生成的记录不能修改或删除", "System-generated records can't be edited or deleted"],
  HANDOFF_FORBIDDEN: ["只有值班中的成员可以结束值班", "Only the on-duty member can end the handoff"],
  SHARE_GONE: ["分享链接已失效", "This share link is no longer available"],
  ROLE_FORBIDDEN: ["你没有执行此操作的权限", "You don't have permission to perform this action"],
};

// 常见服务端/网络消息的中文兜底:契约英文的最后防线（未登记 code 时）。
// 结构: [匹配正则, 中文文案, English 文案]，tt() 在调用时求值。
const MESSAGE_ZH: Array<[RegExp, string, string]> = [
  [/history limited/i, "只能回看最近 30 天", "You can look back up to 30 days"],
  [/backfill limited/i, "补记只支持最近 7 天", "Backfilling only supports the last 7 days"],
  [/future occurrences|future dates/i, "还没到执行时间", "This isn't due yet"],
  [/task already logged/i, "这条记录家人已经记过了", "A family member already logged this record"],
  [/pet is archived|archived pet/i, "宠物已归档，处于只读状态", "This pet is archived and read-only"],
  [/resource was modified concurrently|version conflict/i, "内容刚被家人更新过，请刷新后重试", "This content was just updated by a family member. Please refresh and try again"],
  [/quota|exceeded/i, "额度已用完，请先清理不需要的数据", "Your quota is used up. Please clean up unneeded data first"],
  [/invalid or expired/i, "登录已失效，请重新登录", "Your session has expired. Please sign in again"],
  [/already exists|duplicate/i, "已经存在相同的记录", "An identical record already exists"],
  [/not found|no longer available/i, "内容不存在或已被删除", "This content doesn't exist or has been deleted"],
  [/last owner/i, "圈主不能直接退出，请先转让圈主", "The owner can't leave directly. Transfer ownership first"],
];

export function errorMessage(
  error: unknown,
  fallback = tt("出了点问题，请重试。", "Something went wrong. Please try again."),
) {
  if (isApiError(error)) {
    if (error.status === 404) return tt("内容不存在或已被删除。", "This content doesn't exist or has been deleted.");
    const byCode = CODE_MESSAGES[error.code];
    if (byCode) return tt(byCode[0], byCode[1]);
    if (error.status === 429)
      return error.retryAfterSeconds
        ? tt(`操作太频繁，${error.retryAfterSeconds} 秒后再试。`, `Too many attempts. Please try again in ${error.retryAfterSeconds} seconds.`)
        : tt("操作太频繁，请稍后再试。", "Too many attempts. Please try again later.");
    if (error.status >= 500)
      return tt("服务暂时不可用，改动已保留，稍后重试。", "The service is temporarily unavailable. Your changes are saved. Please try again later.");
    const hit = MESSAGE_ZH.find(([pattern]) => pattern.test(error.message));
    return hit ? tt(hit[1], hit[2]) : error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
