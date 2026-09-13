/**
 * PLANET App 延伸层公共出口（L3–L4）。
 * 只读聚合走 extensionReaders；L0–L2 仍走 foundation。
 * @see docs/FOUNDATION.md §4.4, §5
 */
export type {
  ExtensionCareStatsQuery,
  ExtensionCreateShareInput,
  ExtensionGrantAccessInput,
  ExtensionHandoffClaimInput,
  ExtensionReaders,
  ExtensionTimelineRangeQuery,
  ExtensionWriters,
} from './contracts'

export { createExtensionReaders, extensionReaders, readTimelineInRange } from './readers'
export { createExtensionWriters, extensionWriters } from './writers'
export { useExtensionWriters } from './hooks'
