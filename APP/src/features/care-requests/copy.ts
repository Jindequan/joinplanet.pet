import type { CareRequestState } from '../../core/api/planet-api'

/** Keep the pet identity visible without repeating it when the task title already includes it. */
export function careRequestSubject(petName: string, occurrenceTitle: string) {
  const pet = petName.trim()
  const title = occurrenceTitle.trim()
  if (!pet) return title
  if (!title) return pet
  return title.toLocaleLowerCase().includes(pet.toLocaleLowerCase())
    ? title
    : `${pet} · ${title}`
}

export type CareRequestStatusLike = {
  state: CareRequestState
  from_user_name: string
  target_user_id: string
  target_user_name: string
  next_target_user_name?: string
  occurrence_completed_by_user_id?: string
  occurrence_completed_by_name?: string
}

function completionCopy(request: CareRequestStatusLike, currentUserId: string) {
  if (!request.occurrence_completed_by_name) return ''
  const who = request.occurrence_completed_by_user_id === currentUserId
    ? '你'
    : request.occurrence_completed_by_name
  return `已完成 · ${who}`
}

export function careRequestStateLabel(state: CareRequestState) {
  switch (state) {
    case 'sent':
      return '等你回应'
    case 'seen':
      return '等你回应'
    case 'accepted':
      return '由你负责'
    case 'declined':
      return '未能接手'
    case 'delegated':
      return '已交给其他人'
    case 'expired':
      return '已过期'
    case 'cancelled':
      return '已取消'
    default:
      return '当前状态不可用，请刷新'
  }
}

/** Full sentence used by the inbox receipt card. Keep it concrete and easy to act on. */
export function careRequestStatusCopy(request: CareRequestStatusLike, currentUserId: string) {
  const completed = completionCopy(request, currentUserId)
  if (completed) return completed
  switch (request.state) {
    case 'accepted':
      return request.target_user_id === currentUserId
        ? '这件事由你负责'
        : `这件事由 ${request.target_user_name} 负责`
    case 'declined':
      return request.next_target_user_name
        ? `${request.target_user_name} 未能接手，已找 ${request.next_target_user_name}`
        : request.target_user_id === currentUserId
          ? '你未能接手，还没人负责'
          : `${request.target_user_name} 未能接手，还没人负责`
    case 'delegated':
      return request.next_target_user_name
        ? `这件事已转给 ${request.next_target_user_name}`
        : '正在重新安排这件事'
    case 'expired':
      return '这件事还没人做，时间已经过了'
    case 'cancelled':
      return '这件事已取消'
    case 'sent':
    case 'seen':
      return request.target_user_id === currentUserId
        ? '有人请你做这件事'
        : `等 ${request.target_user_name} 回应`
    default:
      return '状态已更新'
  }
}

/** Short heading for a status receipt; terminal states should not all sound like a new request. */
export function careRequestStatusTitle(request: CareRequestStatusLike, currentUserId: string) {
  if (request.occurrence_completed_by_name) return '已完成'
  switch (request.state) {
    case 'accepted':
      return request.target_user_id === currentUserId ? '你已接手' : `${request.target_user_name} 已接手`
    case 'declined':
      return request.next_target_user_name ? `已转给 ${request.next_target_user_name}` : '还没人接手'
    case 'delegated':
      return request.next_target_user_name ? `已转给 ${request.next_target_user_name}` : '正在找下一位'
    case 'expired':
      return '已过期，还没人做'
    case 'cancelled':
      return '这件事已取消'
    case 'sent':
    case 'seen':
      // The detail card already has a second line that names the person who
      // must answer. Keep the heading about the request itself so it does not
      // repeat the exact same sentence twice for the sender.
      return request.target_user_id === currentUserId ? '等你回应' : '请求已发出'
    default:
      return '当前状态不可用，请刷新'
  }
}

/** Compact sentence used inside a Today row. */
export function careRequestCompactCopy(request: CareRequestStatusLike, currentUserId?: string) {
  switch (request.state) {
    case 'sent':
    case 'seen':
      return request.target_user_id === currentUserId
        ? '等你回应'
        : `等待 ${request.target_user_name} 回应`
    case 'accepted':
      return request.target_user_id === currentUserId ? '由你负责' : `由 ${request.target_user_name} 负责`
    case 'declined':
      return request.next_target_user_name
        ? `未能接手 · 已转给 ${request.next_target_user_name}`
        : request.target_user_id === currentUserId
          ? '未能接手 · 还没人负责'
          : '未能接手 · 还没人负责'
    case 'delegated':
      return request.next_target_user_name ? `已转给 ${request.next_target_user_name}` : '正在重新安排'
    case 'expired':
      return '时间已过，没人做完'
    case 'cancelled':
      return '已取消'
    default:
      return '当前状态不可用，请刷新'
  }
}

/**
 * The compact route shown on Today. The status sentence answers “what now?”;
 * this answers “who handed this to whom?” so the family can coordinate without
 * opening the request detail.
 */
export function careRequestRouteCopy(request: CareRequestStatusLike, currentUserId?: string) {
  const from = request.from_user_name
  const target = request.target_user_id === currentUserId ? '你' : request.target_user_name
  const next = request.next_target_user_name

  if (request.occurrence_completed_by_name) {
    const who = request.occurrence_completed_by_user_id === currentUserId
      ? '你'
      : request.occurrence_completed_by_name
    return `${from} → ${target} · ${who} 已完成`
  }

  if (request.state === 'cancelled') return `${from} → ${target} · 已取消`
  if (request.state === 'expired') return `${from} → ${target} · 已过期`
  if ((request.state === 'declined' || request.state === 'delegated') && next) {
    return `${from} → ${target} → ${next}`
  }
  return `${from} → ${target}`
}
