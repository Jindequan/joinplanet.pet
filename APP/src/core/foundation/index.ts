/**
 * PLANET App 地基公共出口 — 延伸模块只 import 此包（及 ui），不扩散 planetApi 写路径。
 * @see docs/FOUNDATION.md
 */
export type {
  FoundationCompleteCareInput,
  FoundationDomainEvent,
  FoundationFamily,
  FoundationPetSummary,
  FoundationReaders,
  FoundationScheduleActionInput,
  FoundationTimelineEvent,
  FoundationTimelineQuery,
  FoundationTodayQuery,
  FoundationTodayRow,
  FoundationUpdateEventInput,
  FoundationWriteEventInput,
  FoundationWriters,
} from './contracts'

export {
  invalidateAfterCareAction,
  invalidateAfterCarePlanChange,
  invalidateAfterCareRequestChange,
  invalidateAfterRemoteCareLiveSync,
  invalidateAfterExtensionAggregate,
  invalidateAfterFamilyChange,
  invalidateAfterHandoffChange,
  invalidateAfterActivationChange,
  invalidateAfterMedicationChange,
  invalidateAfterPetChange,
  invalidateAfterPreferencesChange,
  invalidateAfterScheduleChange,
  invalidateAfterShareChange,
  invalidateAfterTimelineChange,
} from './cache'

export { createFoundationReaders, foundationReaders, resolveTodayQuery } from './readers'
export { createFoundationWriters } from './writers'
export { useFoundationWriters } from './hooks'
export {
  discardPendingCareTasks,
  enqueuePendingCareTask,
  enqueuePendingCareUndo,
  readPendingCareTasks,
  subscribePendingCareTasks,
  syncPendingCareTaskQueue,
  writePendingCareTasks,
  syncPendingCareTasks,
  type PendingCareTask,
  type SyncPendingResult,
} from './pending-today'
