import { ApiError } from '../network/api-client';

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * 服务端错误码 → 用户可读中文。
 * 服务端 message 是英文实现文案（如 "plan quota exceeded"），不能直接给用户看；
 * 按结构化 code 映射，未覆盖的码走调用方 fallback。
 */
const CODE_MESSAGES: Record<string, string> = {
  QUOTA_FAMILIES_EXCEEDED: '家庭数量已达套餐上限。已删除的家庭在保护期内也会占用名额。',
  QUOTA_MEMBERS_EXCEEDED: '这个家庭的成员数已达套餐上限。',
  QUOTA_PETS_EXCEEDED: '宠物数量已达套餐上限。',
  ROLE_FORBIDDEN: '只有家庭管理员可以执行这个操作。',
  LAST_OWNER: '家庭必须保留一位管理员，请先转让管理员再操作。',
  ALREADY_MEMBER: '你已经在这个家庭里了。',
  PET_ARCHIVED: '这只宠物已归档，档案只读。',
  CARE_PLAN_ARCHIVED: '这个照护计划已归档，不能再修改。',
  TASK_LOG_EXISTS: '这一天已经记录过了。',
  CARE_REQUEST_OPEN: '这项照护已经交给另一位成员，正在等待回应。',
  CARE_REQUEST_ALREADY_ACCEPTED: '这项照护已有负责人，请从当前安排继续转交。',
  CARE_REQUEST_TARGET_PREVIOUSLY_DECLINED: '这位成员已经拒绝过这次照护，请换一位。',
  CARE_REQUEST_NOT_ACTIONABLE: '这条请求已经处理过了，请刷新后查看最新安排。',
  CARE_REQUEST_NOT_REASSIGNABLE: '这件事现在还不能交给别人，请刷新后查看最新安排。',
  CARE_REQUEST_RESPONSE_REQUIRED: '这件事有人等你回应，请先选择怎么处理。',
  CARE_OCCURRENCE_RESOLVED: '这件事已经完成或跳过，不能再交给别人。',
  CARE_OCCURRENCE_ASSIGNED: '这件事已经有人做了，请让当前负责人来安排。',
  CARE_OCCURRENCE_OUTSIDE_HANDOFF_WINDOW: '有些事不在这个时间段，请调整范围。',
  IDEMPOTENCY_KEY_REUSED: '这次操作标识已用于其他操作，请刷新后重新尝试。',
  VERSION_CONFLICT: '内容刚被其他成员改过，请刷新后重试。',
  TRANSFER_PENDING_EXISTS: '这只宠物已有待处理的转移请求。',
  TRANSFER_NOT_PENDING: '这个转移请求已被处理过了。',
  TRANSFER_CONFLICT: '转移状态发生变化，请刷新后重试。',
  SHARE_GONE: '这条分享链接已失效。',
  ACCOUNT_HAS_OWNED_PETS: '你名下还有宠物，请先转移或删除后再操作。',
  UNAUTHENTICATED: '登录已过期，请重新登录。',
  AUTH_RATE_LIMITED: '尝试太频繁，请稍后再试。',
  JOIN_RATE_LIMITED: '尝试太频繁，请稍后再试。',
  SHARE_RATE_LIMITED: '操作太频繁，请稍后再试。',
  PAYLOAD_TOO_LARGE: '内容太大，请精简后重试。',
  INTERNAL: '服务暂时出了点问题，请稍后再试。',
};

export function errorMessage(error: unknown, fallback = '出了点问题，请稍后再试。'): string {
  if (error instanceof ApiError) {
    if (error.status === 0) {
      if (error.code === 'TIMEOUT') return '连接超时，请检查网络后重试。'
      if (error.code === 'ABORTED') return '操作已取消。'
      return '暂时连不上 PLANET，请检查网络后重试。'
    }
    if (error.status === 429) {
      const retry = error.retryAfterSeconds;
      return retry ? `操作太频繁，${retry} 秒后再试。` : '操作太频繁，请稍后再试。';
    }
    if (error.code) {
      const mapped = CODE_MESSAGES[error.code]
      if (mapped) return mapped
    }
    // 服务端 message 是实现细节，未收录的英文也不能直接出现在产品 UI。
    // 具体业务码优先走上面的映射；未知错误按 HTTP 语义给出稳定的中文提示。
    if (error.status >= 500) return '服务暂时出了点问题，请稍后再试。'
    if (error.status === 404) return '内容不存在或已被移除。'
    if (error.status === 403) return '你没有权限执行这个操作。'
    if (error.status === 409) return '内容刚发生变化，请刷新后重试。'
    if (error.status >= 400) return '请检查填写内容后重试。'
    return fallback
  }
  if (error instanceof Error && error.message) {
    // 保留客户端自己写的中文业务提示；运行时/第三方库的英文异常不能
    // 穿透到产品界面，避免用户看到实现细节。
    return /[\u3400-\u9fff]/.test(error.message) ? error.message : fallback;
  }
  return fallback;
}
