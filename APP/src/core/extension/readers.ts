/**
 * L3–L4 延伸层只读端口 — 趋势/分享/导出等聚合读经此出口。
 */
import { planetApi, type TimelineEvent } from '../api/planet-api'
import { foundationReaders } from '../foundation'
import type { ExtensionReaders, ExtensionTimelineRangeQuery } from './contracts'

export async function readTimelineInRange(
  query: ExtensionTimelineRangeQuery,
): Promise<TimelineEvent[]> {
  const { scopeType, scopeId, startMs, pageLimit = 100, maxPages = 40 } = query
  const all: TimelineEvent[] = []
  let cursor: { before: string; before_id: string } | undefined
  for (let page = 0; page < maxPages; page += 1) {
    const res = await foundationReaders.timeline({
      limit: pageLimit,
      family_id: scopeType === 'family' ? scopeId : undefined,
      pet_id: scopeType === 'pet' ? scopeId : undefined,
      before: cursor?.before,
      before_id: cursor?.before_id,
    })
    all.push(...res.events)
    const oldest = res.events.at(-1)
    if (!res.next_cursor || !oldest || new Date(oldest.occurred_at).getTime() < startMs) break
    cursor = res.next_cursor
  }
  const seen = new Set<string>()
  return all.filter((event) => {
    if (new Date(event.occurred_at).getTime() < startMs) return false
    if (seen.has(event.id)) return false
    seen.add(event.id)
    return true
  })
}

export function createExtensionReaders(): ExtensionReaders {
  return {
    careStats: (params) => planetApi.careStats.get(params),
    shares: (petId) => planetApi.pets.shares(petId),
    accessGrants: (petId) => planetApi.pets.accessGrants(petId),
    shareView: (token) => planetApi.shares.view(token),
    petExport: (petId) => planetApi.pets.export(petId),
    handoffSummary: (familyId) => planetApi.handoffs.familySummary(familyId),
    handoff: (petId) => planetApi.handoffs.get(petId),
    timelineInRange: readTimelineInRange,
  }
}

export const extensionReaders = createExtensionReaders()
