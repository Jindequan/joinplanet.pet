/**
 * Native notification contract shared by category registration and response
 * handling. Keep these identifiers aligned with the server's Expo payload.
 */
export const CARE_NOTIFICATION_CATEGORY = {
  request: 'care_request',
  batch: 'care_handoff_batch',
} as const

export const CARE_NOTIFICATION_ACTION = {
  request: {
    accept: 'care_accept',
    decline: 'care_decline',
    delegate: 'care_delegate',
  },
  batch: {
    accept: 'care_batch_accept',
    decline: 'care_batch_decline',
    delegate: 'care_batch_delegate',
  },
} as const

export type CareNotificationKind =
  | typeof CARE_NOTIFICATION_CATEGORY.request
  | typeof CARE_NOTIFICATION_CATEGORY.batch
  | 'care_reminder'
  | 'care_digest'
  | 'care_alert'
  | 'care_handoff'
  | 'care_handoff_batch_status'
  | 'care_completed'

export type CareNotificationData = {
  kind?: string
  care_request_id?: string
  care_batch_id?: string
  occurrence_id?: string
  family_id?: string
  pet_id?: string
}

export type CareNotificationAction = 'accept' | 'decline' | 'delegate' | 'open'

export type CareNotificationRoute =
  | { surface: 'request'; requestId: string; careAction?: 'delegate' | 'reassign' }
  | { surface: 'batch'; batchId: string; careAction?: 'delegate' | 'reassign' }
  | { surface: 'today'; occurrenceId?: string; familyId?: string; petId?: string }

/** Convert native identifiers into the small action set used by the UI. */
export function careNotificationAction(identifier?: string): CareNotificationAction {
  switch (identifier) {
    case CARE_NOTIFICATION_ACTION.request.accept:
    case CARE_NOTIFICATION_ACTION.batch.accept:
      return 'accept'
    case CARE_NOTIFICATION_ACTION.request.decline:
    case CARE_NOTIFICATION_ACTION.batch.decline:
      return 'decline'
    case CARE_NOTIFICATION_ACTION.request.delegate:
    case CARE_NOTIFICATION_ACTION.batch.delegate:
      return 'delegate'
    default:
      return 'open'
  }
}

/** Expo category attached to an actionable server notification. */
export function careNotificationCategory(kind?: string) {
  if (kind === CARE_NOTIFICATION_CATEGORY.request) return CARE_NOTIFICATION_CATEGORY.request
  if (kind === CARE_NOTIFICATION_CATEGORY.batch) return CARE_NOTIFICATION_CATEGORY.batch
  return undefined
}

/** Resolve the canonical in-app surface for a notification response. */
export function careNotificationRoute(
  data: CareNotificationData | undefined,
  action: CareNotificationAction,
): CareNotificationRoute | undefined {
  if (!data?.kind) return undefined
  if (data.kind === CARE_NOTIFICATION_CATEGORY.request && data.care_request_id) {
    return {
      surface: 'request',
      requestId: data.care_request_id,
      ...(action === 'delegate' ? { careAction: 'delegate' as const } : {}),
      ...(action === 'decline' ? { careAction: 'reassign' as const } : {}),
    }
  }
  if (data.kind === 'care_handoff') {
    return data.care_request_id
      ? { surface: 'request', requestId: data.care_request_id }
      : {
          surface: 'today',
          ...(data.occurrence_id ? { occurrenceId: data.occurrence_id } : {}),
          ...(data.family_id ? { familyId: data.family_id } : {}),
          ...(data.pet_id ? { petId: data.pet_id } : {}),
        }
  }
  if (data.kind === CARE_NOTIFICATION_CATEGORY.batch && data.care_batch_id) {
    return {
      surface: 'batch',
      batchId: data.care_batch_id,
      ...(action === 'delegate' ? { careAction: 'delegate' as const } : {}),
      ...(action === 'decline' ? { careAction: 'reassign' as const } : {}),
    }
  }
  if (data.kind === 'care_handoff_batch_status' && data.care_batch_id) {
    return { surface: 'batch', batchId: data.care_batch_id }
  }
  if (
    data.kind === 'care_completed' ||
    data.kind === 'care_reminder' ||
    data.kind === 'care_digest' ||
    data.kind === 'care_alert'
  ) {
    return {
      surface: 'today',
      ...(data.occurrence_id ? { occurrenceId: data.occurrence_id } : {}),
      ...(data.family_id ? { familyId: data.family_id } : {}),
      ...(data.pet_id ? { petId: data.pet_id } : {}),
    }
  }
  return undefined
}
