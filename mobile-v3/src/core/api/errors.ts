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

// 常见服务端/网络消息的中文兜底:契约英文的最后防线
// 结构: [匹配正则, 中文文案, English 文案]，tt() 在调用时求值。
const MESSAGE_ZH: Array<[RegExp, string, string]> = [
  [/task already logged/i, "这条记录家人已经记过了", "A family member already logged this record"],
  [/pet is archived|archived pet/i, "宠物已归档,处于只读状态", "This pet is archived and read-only"],
  [/backfill limited/i, "补记只支持最近 7 天", "Backfilling only supports the last 7 days"],
  [/resource was modified concurrently|version conflict/i, "内容刚被家人更新过,请刷新后重试", "This content was just updated by a family member. Please refresh and try again"],
  [/quota|exceeded/i, "额度已用完,请先清理不需要的数据", "Your quota is used up. Please clean up unneeded data first"],
  [/invalid or expired/i, "登录已失效,请重新登录", "Your session has expired. Please sign in again"],
  [/already exists|duplicate/i, "已经存在相同的记录", "An identical record already exists"],
  [/not found|no longer available/i, "内容不存在或已被删除", "This content doesn't exist or has been deleted"],
  [/last owner/i, "圈主不能直接退出,请先转让圈主", "The owner can't leave directly. Transfer ownership first"],
  [/future occurrences/i, "还没到执行时间", "This isn't due yet"],
];

export function errorMessage(
  error: unknown,
  fallback = tt("出了点问题,请重试。", "Something went wrong. Please try again."),
) {
  if (isApiError(error)) {
    if (error.code === "ROLE_FORBIDDEN")
      return tt("你没有执行此操作的权限。", "You don't have permission to perform this action.");
    if (error.status === 404) return tt("内容不存在或已被删除。", "This content doesn't exist or has been deleted.");
    if (error.status === 429)
      return error.retryAfterSeconds
        ? tt(`操作太频繁,${error.retryAfterSeconds} 秒后再试。`, `Too many attempts. Please try again in ${error.retryAfterSeconds} seconds.`)
        : tt("操作太频繁,请稍后再试。", "Too many attempts. Please try again later.");
    if (error.status >= 500)
      return tt("服务暂时不可用,改动已保留,稍后重试。", "The service is temporarily unavailable. Your changes are saved. Please try again later.");
    const hit = MESSAGE_ZH.find(([pattern]) => pattern.test(error.message));
    return hit ? tt(hit[1], hit[2]) : error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
