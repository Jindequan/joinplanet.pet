/**
 * 地基缓存失效图 — L0–L2 写入后必须走此处；延伸层只读聚合一并失效。
 */
import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from '../query/keys'
import { publishCareLiveSync, type CareLiveSyncEvent } from '../collaboration/live-sync'

function invalidateTimelineAll(client: QueryClient) {
  void client.invalidateQueries({ queryKey: ['timeline'] })
}

function invalidateTodayAll(client: QueryClient) {
  void client.invalidateQueries({ queryKey: ['today'] })
  // Today and the family digest are two projections of the same occurrence
  // state. Keeping only Today fresh makes a completed item appear pending in
  // the summary card mounted on the same screen.
  void client.invalidateQueries({ queryKey: ['digest'] })
}

/** L3 — 请求回应 / 转交：请求、Today、风险和摘要必须一起刷新。 */
export function invalidateAfterCareRequestChange(
  client: QueryClient,
  requestId?: string,
  opts?: { broadcast?: boolean },
) {
  void client.invalidateQueries({ queryKey: queryKeys.careRequestInbox })
  void client.invalidateQueries({ queryKey: queryKeys.careRequestSent })
  void client.invalidateQueries({ queryKey: queryKeys.careHandoffInbox })
  void client.invalidateQueries({ queryKey: ['care-risks'] })
  invalidateTodayAll(client)
  void client.invalidateQueries({
    predicate: (query) => query.queryKey[0] === 'care-requests' && query.queryKey[1] === 'chain',
  })
  if (requestId) {
    void client.invalidateQueries({ queryKey: ['care-requests', 'request', requestId] })
  }
  if (opts?.broadcast !== false) {
    publishCareLiveSync({ kind: 'care-request', ...(requestId ? { requestId } : {}) })
  }
}

/** 延伸层只读聚合（趋势、统计） */
export function invalidateAfterExtensionAggregate(client: QueryClient) {
  void client.invalidateQueries({ queryKey: ['care-stats'] })
  void client.invalidateQueries({ queryKey: ['trends-events'] })
  void client.invalidateQueries({ queryKey: ['trends'] })
}

/** L1 — 完成 / 跳过 / 撤销 / 离线同步 */
export function invalidateAfterCareAction(client: QueryClient, opts?: { broadcast?: boolean }) {
  invalidateTodayAll(client)
  void client.invalidateQueries({ queryKey: ['care-risks'] })
  void client.invalidateQueries({
    predicate: (query) => query.queryKey[0] === 'care-responsibility',
  })
  invalidateTimelineAll(client)
  invalidateAfterExtensionAggregate(client)
  if (opts?.broadcast !== false) publishCareLiveSync({ kind: 'care-action' })
}

/** Apply a sibling browser tab's change without rebroadcasting it. */
export function invalidateAfterRemoteCareLiveSync(client: QueryClient, event: CareLiveSyncEvent) {
  if (event.kind === 'care-request') {
    invalidateAfterCareRequestChange(client, event.requestId, { broadcast: false })
    return
  }
  if (event.kind === 'care-action') {
    invalidateAfterCareAction(client, { broadcast: false })
    return
  }
  if (event.kind === 'workspace') {
    invalidateAfterFamilyChange(client, { broadcast: false })
    return
  }
  invalidateAfterTimelineChange(client, undefined, { broadcast: false })
}

/** L1 — 排程例外 / Rule 版本变更 */
export function invalidateAfterScheduleChange(
  client: QueryClient,
  petId?: string,
  opts?: { broadcast?: boolean },
) {
  invalidateAfterCarePlanChange(client, petId, opts)
}

/** L1 — 照护计划变更 */
export function invalidateAfterCarePlanChange(
  client: QueryClient,
  petId?: string,
  opts?: { broadcast?: boolean },
) {
  invalidateTodayAll(client)
  invalidateTimelineAll(client)
  invalidateAfterExtensionAggregate(client)
  // Family detail surfaces the same plan changes in its governance history.
  // Invalidate all family audit queries because a Pet can belong to more than
  // one Family and this writer only receives the Pet ID.
  void client.invalidateQueries({ queryKey: ['family-audit'] })
  // The responsibility projection and assignment lists are separate reads
  // from the plan itself. A member change must update both immediately, or
  // Today can keep showing the previous person as the next caregiver.
  void client.invalidateQueries({ queryKey: ['care-assignments'] })
  void client.invalidateQueries({ queryKey: ['care-responsibility'] })
  void client.invalidateQueries({ queryKey: ['care-risks'] })
  if (petId) {
    void client.invalidateQueries({ queryKey: queryKeys.carePlans(petId, true) })
    void client.invalidateQueries({ queryKey: queryKeys.carePlans(petId, false) })
    void client.invalidateQueries({ queryKey: queryKeys.pet(petId) })
  } else {
    void client.invalidateQueries({ queryKey: ['care-plans'] })
  }
  if (opts?.broadcast !== false) publishCareLiveSync({ kind: 'workspace' })
}

/** L1 — 用药变更 */
export function invalidateAfterMedicationChange(client: QueryClient, petId?: string) {
  invalidateTimelineAll(client)
  invalidateAfterExtensionAggregate(client)
  if (petId) {
    void client.invalidateQueries({ queryKey: queryKeys.medications(petId) })
    void client.invalidateQueries({ queryKey: queryKeys.pet(petId) })
  } else {
    void client.invalidateQueries({ queryKey: ['medications'] })
  }
}

/** L2 — 宠物档案 / 生命周期 */
export function invalidateAfterPetChange(
  client: QueryClient,
  petId?: string,
  opts?: { broadcast?: boolean },
) {
  void client.invalidateQueries({ queryKey: queryKeys.accessiblePets })
  invalidateTodayAll(client)
  invalidateTimelineAll(client)
  invalidateAfterExtensionAggregate(client)
  if (petId) void client.invalidateQueries({ queryKey: queryKeys.pet(petId) })
  if (opts?.broadcast !== false) publishCareLiveSync({ kind: 'workspace' })
}

/** L2 — 时间线手动编辑（also used by writers） */
export function invalidateAfterTimelineChange(
  client: QueryClient,
  petId?: string,
  opts?: { broadcast?: boolean },
) {
  invalidateTimelineAll(client)
  invalidateAfterExtensionAggregate(client)
  if (petId) {
    void client.invalidateQueries({ queryKey: queryKeys.pet(petId) })
    void client.invalidateQueries({ queryKey: ['weight-events', petId] })
  }
  if (opts?.broadcast !== false) publishCareLiveSync({ kind: 'timeline' })
}

/** L0 — 家庭 / 成员 / 可见性 */
export function invalidateAfterFamilyChange(client: QueryClient, opts?: { broadcast?: boolean }) {
  void client.invalidateQueries({ queryKey: queryKeys.families })
  void client.invalidateQueries({ queryKey: queryKeys.deletedFamilies })
  void client.invalidateQueries({ queryKey: queryKeys.accessiblePets })
  // A family mutation changes more than the family list. Role changes and
  // member removal affect every family-scoped read: the pet workspace's
  // member preview, plan assignments, transfer inbox, handoff summaries and
  // request visibility must not keep showing the old authorization graph.
  const familyScopedRoots = new Set([
    'family',
    'family-audit',
    'pets',
    'care-plans',
    'care-assignments',
    'transfers',
    'care-risks',
    'digest',
    'notification-prefs',
    'usage',
    'handoff-summary',
    'care-responsibility',
    'care-requests',
    'care-handoff-batches',
  ])
  void client.invalidateQueries({
    predicate: (query) => familyScopedRoots.has(String(query.queryKey[0])),
  })
  invalidateTodayAll(client)
  invalidateTimelineAll(client)
  invalidateAfterExtensionAggregate(client)
  if (opts?.broadcast !== false) publishCareLiveSync({ kind: 'workspace' })
}

/** L0 — 账号偏好（仅影响默认范围，不触发全量） */
export function invalidateAfterPreferencesChange(client: QueryClient) {
  void client.invalidateQueries({ queryKey: queryKeys.preferences })
  void client.invalidateQueries({ queryKey: queryKeys.me })
}

/** L4 — 分享链接变更（延伸，但集中失效规则） */
export function invalidateAfterShareChange(client: QueryClient, petId: string) {
  void client.invalidateQueries({ queryKey: queryKeys.shares(petId) })
}

/** L3 — 接力值班变更（延伸元数据 + 时间线 note） */
export function invalidateAfterHandoffChange(client: QueryClient, opts?: { petId?: string; familyId?: string }) {
  if (opts?.petId) void client.invalidateQueries({ queryKey: queryKeys.handoff(opts.petId) })
  if (opts?.familyId) {
    void client.invalidateQueries({ queryKey: queryKeys.handoffSummary(opts.familyId) })
    void client.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === 'care-responsibility' && query.queryKey[1] === opts.familyId,
    })
  }
  invalidateTimelineAll(client)
}

export function invalidateAfterActivationChange(client: QueryClient) {
  void client.invalidateQueries({ queryKey: queryKeys.activationSummary })
  invalidateTodayAll(client)
}
