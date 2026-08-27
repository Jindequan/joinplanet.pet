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
const MESSAGE_ZH: Array<[RegExp, string]> = [
  [/task already logged/i, "这条记录家人已经记过了"],
  [/pet is archived|archived pet/i, "宠物已归档,处于只读状态"],
  [/backfill limited/i, "补记只支持最近 7 天"],
  [/resource was modified concurrently|version conflict/i, "内容刚被家人更新过,请刷新后重试"],
  [/quota|exceeded/i, "额度已用完,请先清理不需要的数据"],
  [/invalid or expired/i, "登录已失效,请重新登录"],
  [/already exists|duplicate/i, "已经存在相同的记录"],
  [/not found|no longer available/i, "内容不存在或已被删除"],
  [/last owner/i, "圈主不能直接退出,请先转让圈主"],
  [/future occurrences/i, "还没到执行时间"],
];

export function errorMessage(
  error: unknown,
  fallback = "出了点问题,请重试。",
) {
  if (isApiError(error)) {
    if (error.code === "ROLE_FORBIDDEN")
      return "你没有执行此操作的权限。";
    if (error.status === 404) return "内容不存在或已被删除。";
    if (error.status === 429)
      return error.retryAfterSeconds
        ? `操作太频繁,${error.retryAfterSeconds} 秒后再试。`
        : "操作太频繁,请稍后再试。";
    if (error.status >= 500)
      return "服务暂时不可用,改动已保留,稍后重试。";
    const zh = MESSAGE_ZH.find(([pattern]) => pattern.test(error.message))?.[1];
    return zh ?? error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
