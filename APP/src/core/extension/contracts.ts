/**
 * L3–L4 延伸层只读契约 — 只读聚合地基 API，不复制 Occurrence/Event 语义。
 * @see docs/FOUNDATION.md §4.4
 */
import type { CareStats, ShareViewResponse } from '../api/planet-api'

export type ExtensionCareStatsQuery = {
  from: string
  to: string
  family_id?: string
  pet_id?: string
}

export type ExtensionTimelineRangeQuery = {
  scopeType: 'all' | 'family' | 'pet'
  scopeId?: string
  startMs: number
  pageLimit?: number
  maxPages?: number
}

export type ExtensionReaders = {
  careStats: (query: ExtensionCareStatsQuery) => Promise<CareStats>
  shares: (petId: string) => Promise<{ shares: import('../api/planet-api').Share[] }>
  accessGrants: (petId: string) => Promise<{ grants: import('../api/planet-api').AccessGrant[] }>
  shareView: (token: string) => Promise<ShareViewResponse>
  petExport: (petId: string) => Promise<Record<string, unknown>>
  handoffSummary: (familyId: string) => Promise<{ pets: import('../api/planet-api').HandoffSummaryPet[] }>
  handoff: (petId: string) => Promise<{ handoff: import('../api/planet-api').Handoff | null }>
  timelineInRange: (
    query: ExtensionTimelineRangeQuery,
  ) => Promise<import('../api/planet-api').TimelineEvent[]>
}

export type ExtensionCreateShareInput = {
  petId: string
  kind: 'care_card' | 'summary'
  ttlHours: number
  options?: Record<string, unknown>
  idempotencyKey: string
}

export type ExtensionGrantAccessInput = {
  petId: string
  userId: string
  role: import('../api/planet-api').Role
  expiresAt?: string
}

export type ExtensionHandoffClaimInput = {
  petId: string
  note?: string
  idempotencyKey: string
}

export type ExtensionWriters = {
  createShare: (input: ExtensionCreateShareInput) => Promise<{ share: import('../api/planet-api').Share; token: string }>
  revokeShare: (shareId: string) => Promise<void>
  grantAccess: (input: ExtensionGrantAccessInput) => Promise<void>
  revokeAccess: (petId: string, grantId: string) => Promise<void>
  claimHandoff: (input: ExtensionHandoffClaimInput) => Promise<import('../api/planet-api').Handoff>
  releaseHandoff: (petId: string, note: string, idempotencyKey: string) => Promise<void>
}
