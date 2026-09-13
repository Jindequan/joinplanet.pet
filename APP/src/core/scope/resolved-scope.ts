import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { planetApi } from '../api/planet-api'
import { foundationReaders, resolveTodayQuery, type FoundationTodayQuery } from '../foundation'
import { queryKeys } from '../query/keys'
import { civilDateInTimezone } from '../time/civil'
import { scopeFilterNeeded, scopeLabel, type Scope } from './scope'
import { useScope } from './scope-provider'

export type ResolvedScope = {
  scope: Scope
  label: string
  timezone: string | undefined
  familyIdForCollaboration: string | undefined
  /** Family edge used to define a Pet-scoped Today day. */
  todayFamilyId: string | undefined
  /** A multi-family Pet cannot safely use the device or primary-family day. */
  familySelectionRequired: boolean
  filterNeeded: boolean
  todayQuery: FoundationTodayQuery
  civilToday: string
  /** A scope dependency failed before it could provide a trustworthy scope. */
  scopeError?: unknown
  retryScope: () => void
}

export function resolvePetTimezone(
  petFamilyIds: string[] | undefined,
  families: Array<{ id: string; timezone: string }>,
  preferredFamilyId?: string | null,
): string | undefined {
  const familyIds = petFamilyIds ?? []
  const familyId = preferredFamilyId && familyIds.includes(preferredFamilyId)
    ? preferredFamilyId
    : familyIds.length === 1
      ? familyIds[0]
      : undefined
  return families.find((family) => family.id === familyId)?.timezone
}

function collaborationFamilyId(
  scope: Scope,
  families: Array<{ id: string }>,
  preferences: { default_family_id?: string | null },
  activePets: Array<{ id: string; family_ids?: string[] }>,
): string | undefined {
  if (scope.type === 'family') return scope.id
  if (scope.type === 'pet') {
    const pet = activePets.find((item) => item.id === scope.id)
    const familyIds = pet?.family_ids ?? []
    if (scope.familyId && familyIds.includes(scope.familyId) && families.some((family) => family.id === scope.familyId)) {
      return scope.familyId
    }
    if (preferences.default_family_id && familyIds.includes(preferences.default_family_id)) {
      return preferences.default_family_id
    }
    return familyIds.length === 1 && families.some((family) => family.id === familyIds[0])
      ? familyIds[0]
      : undefined
  }
  return families.length === 1 ? families[0]?.id : undefined
}

function resolveTimezone(
  scope: Scope,
  families: Array<{ id: string; timezone: string }>,
  activePets: Array<{ id: string; family_ids?: string[] }>,
  preferredFamilyId?: string | null,
): string | undefined {
  if (scope.type === 'family') {
    return families.find((family) => family.id === scope.id)?.timezone
  }
  if (scope.type === 'pet') {
    const pet = activePets.find((item) => item.id === scope.id)
    const familyIds = pet?.family_ids ?? []
    return resolvePetTimezone(familyIds, families, scope.familyId ?? preferredFamilyId)
  }
  return families.length === 1 ? families[0]?.timezone : undefined
}

export function useResolvedScope(options?: {
  selectedDate?: string
  clock?: Date
}): ResolvedScope & { ready: boolean } {
  const selectedDate = options?.selectedDate ?? ''
  const { scope, setScope, ready: scopeReady } = useScope()
  const [clock, setClock] = useState(() => options?.clock ?? new Date())

  useEffect(() => {
    if (options?.clock) return
    const timer = setInterval(() => setClock(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [options?.clock])

  const effectiveClock = options?.clock ?? clock

  const familiesQuery = useQuery({
    queryKey: queryKeys.families,
    queryFn: () => foundationReaders.families(),
  })
  const petsQuery = useQuery({
    queryKey: queryKeys.accessiblePets,
    queryFn: () => foundationReaders.accessiblePets(),
  })
  const preferencesQuery = useQuery({
    queryKey: queryKeys.preferences,
    queryFn: () => planetApi.me.preferences(),
  })

  const families = familiesQuery.data?.families ?? []
  const allPets = petsQuery.data?.pets ?? []
  const activePets = allPets.filter((pet) => !pet.archived_at)
  const prefs = preferencesQuery.data?.preferences ?? {}

  useEffect(() => {
    if (!scopeReady || !familiesQuery.isSuccess || !petsQuery.isSuccess) return
    const valid =
      scope.type === 'all' ||
      (scope.type === 'family' && families.some((family) => family.id === scope.id)) ||
      (scope.type === 'pet' && activePets.some((pet) => pet.id === scope.id))
    if (!valid) setScope({ type: 'all' })
  }, [activePets, families, familiesQuery.isSuccess, petsQuery.isSuccess, scope, scopeReady, setScope])

  const timezone = resolveTimezone(scope, families, activePets, prefs.default_family_id)
  const civilToday = civilDateInTimezone(timezone, effectiveClock)

  const scopeFamilyId = scope.type === 'family' ? scope.id : undefined
  const scopePetId = scope.type === 'pet' ? scope.id : undefined
  const todayFamilyId = scope.type === 'pet'
    ? collaborationFamilyId(scope, families, prefs, activePets)
    : scopeFamilyId
  const selectedPet = scope.type === 'pet' ? activePets.find((pet) => pet.id === scope.id) : undefined
  const familySelectionRequired = Boolean(
    scope.type === 'pet' &&
      (selectedPet?.family_ids?.length ?? 0) > 1 &&
      !todayFamilyId,
  )

  useEffect(() => {
    if (!scopeReady || !familiesQuery.isSuccess || !petsQuery.isSuccess) return
    if (scope.type !== 'pet' || !todayFamilyId || !selectedPet) return
    const edgeIsValid = Boolean(
      scope.familyId &&
        selectedPet.family_ids?.includes(scope.familyId) &&
        families.some((family) => family.id === scope.familyId),
    )
    if (!edgeIsValid || scope.familyId !== todayFamilyId) {
      setScope({ type: 'pet', id: scope.id, familyId: todayFamilyId })
    }
  }, [
    families,
    familiesQuery.isSuccess,
    petsQuery.isSuccess,
    scope,
    scopeReady,
    selectedPet,
    setScope,
    todayFamilyId,
  ])

  const todayQuery = resolveTodayQuery({
    scopeType: scope.type,
    scopeFamilyId: todayFamilyId,
    scopePetId,
    selectedDate,
    civilToday,
  })

  const ready =
    scopeReady &&
    !familiesQuery.isLoading &&
    !petsQuery.isLoading &&
    !preferencesQuery.isLoading &&
    (Boolean(familiesQuery.data) || !familiesQuery.error) &&
    (Boolean(petsQuery.data) || !petsQuery.error) &&
    (Boolean(preferencesQuery.data) || !preferencesQuery.error)

  const scopeError =
    (!familiesQuery.data && familiesQuery.error) ||
    (!petsQuery.data && petsQuery.error) ||
    (!preferencesQuery.data && preferencesQuery.error) ||
    undefined
  const retryScope = () => {
    void familiesQuery.refetch()
    void petsQuery.refetch()
    void preferencesQuery.refetch()
  }

  return {
    scope,
    label: scopeLabel(scope, families, allPets),
    timezone,
    familyIdForCollaboration: collaborationFamilyId(scope, families, prefs, activePets),
    todayFamilyId,
    familySelectionRequired,
    filterNeeded: scopeFilterNeeded(families, activePets),
    todayQuery,
    civilToday,
    scopeError,
    retryScope,
    ready,
  }
}
