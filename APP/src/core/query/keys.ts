export const queryKeys = {
  session: ['session'] as const,
  me: ['me'] as const,
  meUsage: ['me', 'usage'] as const,
  sessions: ['me', 'sessions'] as const,
  families: ['families'] as const,
  deletedFamilies: ['families', 'deleted'] as const,
  family: (familyId: string) => ['family', familyId] as const,
  familyAudit: (familyId: string) => ['family-audit', familyId] as const,
  pets: (familyId: string) => ['pets', familyId] as const,
  accessiblePets: ['pets', 'accessible'] as const,
  deletedPets: ['pets', 'deleted'] as const,
  pet: (petId: string) => ['pet', petId] as const,
  medications: (petId: string) => ['medications', petId] as const,
  carePlans: (petId: string, includeArchived = false, familyId?: string) => ['care-plans', petId, includeArchived ? 'all' : 'active', ...(familyId ? [familyId] : [])] as const,
  assignments: (carePlanId: string, familyId?: string) => ['care-assignments', carePlanId, familyId ?? null] as const,
  today: (params: { date?: string; familyId?: string; petId?: string }) =>
    ['today', params.date ?? 'current', params.familyId ?? null, params.petId ?? null] as const,
  preferences: ['me', 'preferences'] as const,
  todayFamily: (familyId: string, date: string) => ['today', familyId, date] as const,
  todayPet: (petId: string, date: string) => ['today', 'pet', petId, date] as const,
  timeline: (petId: string, cursor?: string) => ['timeline', petId, cursor ?? null] as const,
  aggregateTimeline: (params: {
    familyId?: string | null
    petId?: string | null
    before?: string | null
    beforeId?: string | null
  }) =>
    [
      'timeline',
      'aggregate',
      params.familyId ?? null,
      params.petId ?? null,
      params.before ?? null,
      params.beforeId ?? null,
    ] as const,
  careStats: (params: {
    from: string
    to: string
    familyId?: string | null
    petId?: string | null
  }) =>
    ['care-stats', params.from, params.to, params.familyId ?? null, params.petId ?? null] as const,
  trends: (params: {
    scopeType: 'all' | 'family' | 'pet'
    scopeId?: string | null
    rangeKey: string
  }) =>
    ['trends', params.scopeType, params.scopeId ?? null, params.rangeKey] as const,
  alerts: (familyId: string) => ['alerts', familyId] as const,
  careRisks: (familyId: string, date?: string) => ['care-risks', familyId, date ?? 'current'] as const,
  digest: (familyId: string, date: string) => ['digest', familyId, date] as const,
  usage: (familyId: string) => ['usage', familyId] as const,
  notificationPrefs: (familyId: string) => ['notification-prefs', familyId] as const,
  transfers: (familyId: string, direction?: string) => ['transfers', familyId, direction ?? 'incoming'] as const,
  shares: (petId: string) => ['shares', petId] as const,
  handoff: (petId: string) => ['handoff', petId] as const,
  handoffSummary: (familyId: string) => ['handoff-summary', familyId] as const,
  activationSummary: ['activation-summary'] as const,
  capabilities: ['capabilities'] as const,
  careResponsibility: (familyId: string, petId?: string) =>
    ['care-responsibility', familyId, petId ?? ''] as const,
  careRequestInbox: ['care-requests', 'inbox'] as const,
  careRequestSent: ['care-requests', 'sent'] as const,
  careRequestChain: (requestId: string) => ['care-requests', 'chain', requestId] as const,
  careHandoffInbox: ['care-handoff-batches', 'inbox'] as const,
  careHandoffBatch: (batchId: string) => ['care-handoff-batches', batchId] as const,
};
