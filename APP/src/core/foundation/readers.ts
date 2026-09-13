/**
 * 地基只读端口 — 所有 L0–L2 读 API 经此出口，便于延伸层与测试替换实现。
 */
import { planetApi } from '../api/planet-api'
import type {
  FoundationReaders,
  FoundationTimelineQuery,
  FoundationTodayQuery,
} from './contracts'

export function createFoundationReaders(): FoundationReaders {
  return {
    today: (query?: FoundationTodayQuery) => planetApi.today.get(query),
    timeline: (query: FoundationTimelineQuery) => planetApi.timeline.list(query),
    accessiblePets: () => planetApi.pets.listAccessible(),
    families: () => planetApi.families.list(),
    pet: (petId: string) => planetApi.pets.get(petId),
  }
}

/** 模块级单例，供 React Query queryFn 使用 */
export const foundationReaders = createFoundationReaders()

/**
 * All 范围 + 实时「今天」：不传 date，由 API 按各计划时区聚合。
 * 显式选历史日期或 family/pet 范围：传 civil date。
 */
export function resolveTodayQuery(params: {
  scopeType: 'all' | 'family' | 'pet'
  scopeFamilyId?: string
  scopePetId?: string
  selectedDate: string
  civilToday: string
}): FoundationTodayQuery {
  const { scopeType, scopeFamilyId, scopePetId, selectedDate, civilToday } = params
  const query: FoundationTodayQuery = {}
  if (scopeFamilyId) query.family_id = scopeFamilyId
  if (scopePetId) query.pet_id = scopePetId
  // A Pet can be linked to more than one Family. Without an explicit edge,
  // let the server choose its authoritative primary-family day instead of
  // sending a device-local date that can be in the future there.
  if (scopeType === 'pet' && !scopeFamilyId && !selectedDate) {
    return query
  }
  if (scopeType === 'all' && !selectedDate) {
    return query
  }
  query.date = selectedDate || civilToday
  return query
}
