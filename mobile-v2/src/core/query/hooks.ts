import { useMemo } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { planetApi, type Alert, type TodayPet } from '../api/planet-api';
import { queryKeys } from './keys';

export function useMe(enabled = true) {
  return useQuery({ queryKey: queryKeys.me, queryFn: planetApi.me.get, enabled });
}

export function useFamilies(enabled = true) {
  return useQuery({ queryKey: queryKeys.families, queryFn: planetApi.families.list, enabled });
}

export function useDeletedFamilies(enabled = true) {
  return useQuery({ queryKey: queryKeys.deletedFamilies, queryFn: planetApi.families.deleted, enabled });
}

export function useFamily(familyId?: string) {
  return useQuery({ queryKey: queryKeys.family(familyId ?? ''), queryFn: () => planetApi.families.detail(familyId as string), enabled: Boolean(familyId) });
}

export function useFamilyPets(familyId?: string) {
  return useQuery({ queryKey: queryKeys.pets(familyId ?? ''), queryFn: () => planetApi.pets.list(familyId as string), enabled: Boolean(familyId) });
}

export function useAccessiblePets(familyIds: string[]) {
  const accessible = useQuery({ queryKey: queryKeys.accessiblePets, queryFn: planetApi.pets.listAccessible });
  const familyIdsKey = familyIds.join('\u001f');
  const stableFamilyIds = useMemo(() => [...familyIds], [familyIdsKey]);
  const familyQueries = useMemo(() => stableFamilyIds.map((familyId) => ({
    queryKey: queryKeys.pets(familyId),
    queryFn: () => planetApi.pets.list(familyId),
  })), [stableFamilyIds]);
  const queries = useQueries({
    queries: familyQueries,
  });
  const petsById = new Map<string, NonNullable<(typeof queries)[number]['data']>['pets'][number]>();
  queries.forEach((query) => query.data?.pets.forEach((pet) => petsById.set(pet.id, pet)));
  accessible.data?.pets.forEach((pet) => petsById.set(pet.id, pet));
  return {
    pets: [...petsById.values()],
    isLoading: accessible.isLoading || queries.some((query) => query.isLoading),
    isFetching: accessible.isFetching || queries.some((query) => query.isFetching),
    isError: accessible.isError || queries.some((query) => query.isError),
    hasData: accessible.data !== undefined || queries.some((query) => query.data !== undefined),
    refetch: () => Promise.all([accessible.refetch(), ...queries.map((query) => query.refetch())]),
  };
}

export function usePet(petId?: string) {
  return useQuery({ queryKey: queryKeys.pet(petId ?? ''), queryFn: () => planetApi.pets.get(petId as string), enabled: Boolean(petId) });
}

export function useToday(familyId?: string, date = '') {
  return useQuery({ queryKey: queryKeys.today(familyId ?? '', date), queryFn: () => planetApi.families.today(familyId as string, date || undefined), enabled: Boolean(familyId) });
}

export function useTodayForFamilies(familyIds: string[], date: string | Record<string, string> = '', directPetIds: string[] = [], directDate = '') {
  const familyIdsKey = familyIds.join('\u001f');
  const directPetIdsKey = directPetIds.join('\u001f');
  const dateKey = typeof date === 'string' ? date : JSON.stringify(date);
  const stableFamilyIds = useMemo(() => [...familyIds], [familyIdsKey]);
  const stableDirectPetIds = useMemo(() => [...directPetIds], [directPetIdsKey]);
  const stableDate = useMemo(() => date, [dateKey]);
  const familyQueries = useMemo(() => stableFamilyIds.map((familyId) => {
    const familyDate = typeof stableDate === 'string' ? stableDate : stableDate[familyId] ?? '';
    return {
      queryKey: queryKeys.today(familyId, familyDate),
      queryFn: () => planetApi.families.today(familyId, familyDate || undefined),
    };
  }), [dateKey, stableFamilyIds, stableDate]);
  const queries = useQueries({
    queries: familyQueries,
  });
  const directQueriesConfig = useMemo(() => stableDirectPetIds.map((petId) => ({
    queryKey: ['today', 'pet', petId, directDate],
    queryFn: () => planetApi.pets.today(petId, directDate || undefined),
  })), [directDate, stableDirectPetIds]);
  const directQueries = useQueries({
    queries: directQueriesConfig,
  });
  const petsById = new Map<string, { pet_id: string; pet_name: string; items: TodayPet['items'] }>();
  queries.forEach((query) => {
    query.data?.pets.forEach((pet) => {
      const current = petsById.get(pet.pet_id);
      if (!current) {
        petsById.set(pet.pet_id, { pet_id: pet.pet_id, pet_name: pet.pet_name, items: [...pet.items] });
        return;
      }
      const taskIds = new Set(current.items.map((item) => item.task.id));
      current.items.push(...pet.items.filter((item) => !taskIds.has(item.task.id)));
    });
  });
  directQueries.forEach((query) => {
    query.data?.pets.forEach((pet) => {
      const current = petsById.get(pet.pet_id);
      if (!current) {
        petsById.set(pet.pet_id, { pet_id: pet.pet_id, pet_name: pet.pet_name, items: [...pet.items] });
        return;
      }
      const taskIds = new Set(current.items.map((item) => item.task.id));
      current.items.push(...pet.items.filter((item) => !taskIds.has(item.task.id)));
    });
  });
  return {
    data: { date: typeof date === 'string' && date ? date : 'Today', pets: [...petsById.values()] },
    isLoading: queries.some((query) => query.isLoading) || directQueries.some((query) => query.isLoading),
    isFetching: queries.some((query) => query.isFetching) || directQueries.some((query) => query.isFetching),
    isError: queries.some((query) => query.isError) || directQueries.some((query) => query.isError),
    hasData: queries.some((query) => query.data !== undefined) || directQueries.some((query) => query.data !== undefined),
    refetch: () => Promise.all([...queries.map((query) => query.refetch()), ...directQueries.map((query) => query.refetch())]),
  };
}

export function useTimeline(petId?: string) {
  return useQuery({ queryKey: queryKeys.timeline(petId ?? ''), queryFn: () => planetApi.pets.timeline(petId as string, { limit: 100 }), enabled: Boolean(petId) });
}

export function useMedications(petId?: string) {
  return useQuery({ queryKey: queryKeys.medications(petId ?? ''), queryFn: () => planetApi.pets.medications(petId as string), enabled: Boolean(petId) });
}

export function useCarePlans(petId?: string, includeArchived = false) {
  return useQuery({ queryKey: queryKeys.carePlans(petId ?? '', includeArchived), queryFn: () => planetApi.pets.carePlans(petId as string, includeArchived), enabled: Boolean(petId) });
}

export function useTodayForPet(petId?: string, date = '') {
  return useQuery({ queryKey: queryKeys.todayPet(petId ?? '', date), queryFn: () => planetApi.pets.today(petId as string, date || undefined), enabled: Boolean(petId) });
}

export function useCareAssignments(carePlanId?: string) {
  return useQuery({ queryKey: queryKeys.assignments(carePlanId ?? ''), queryFn: () => planetApi.carePlans.assignments(carePlanId as string), enabled: Boolean(carePlanId) });
}

export function usePetShares(petId?: string, enabled = true) {
  return useQuery({ queryKey: queryKeys.shares(petId ?? ''), queryFn: () => planetApi.pets.shares(petId as string), enabled: Boolean(petId) && enabled });
}

export function useTransfers(familyId?: string, direction: 'incoming' | 'outgoing' = 'incoming') {
  return useQuery({ queryKey: queryKeys.transfers(familyId ?? '', direction), queryFn: () => planetApi.transfers.list(familyId as string, direction), enabled: Boolean(familyId) });
}

export function useAlertsForFamilies(familyIds: string[]) {
  const familyIdsKey = familyIds.join('\u001f');
  const stableFamilyIds = useMemo(() => [...familyIds], [familyIdsKey]);
  const familyQueries = useMemo(() => stableFamilyIds.map((familyId) => ({
    queryKey: queryKeys.alerts(familyId),
    queryFn: () => planetApi.families.alerts(familyId),
  })), [stableFamilyIds]);
  const queries = useQueries({
    queries: familyQueries,
  });
  const alerts: Alert[] = [];
  queries.forEach((query) => { if (query.data?.alerts) alerts.push(...query.data.alerts); });
  alerts.sort((left, right) => new Date(right.occurred_at).getTime() - new Date(left.occurred_at).getTime());
  return {
    alerts,
    isLoading: queries.some((query) => query.isLoading),
    isFetching: queries.some((query) => query.isFetching),
    isError: queries.some((query) => query.isError),
    hasData: queries.some((query) => query.data !== undefined),
    refetch: () => Promise.all(queries.map((query) => query.refetch())),
  };
}

export function useFamilyUsage(familyId?: string) {
  return useQuery({ queryKey: queryKeys.usage(familyId ?? ''), queryFn: () => planetApi.families.usage(familyId as string), enabled: Boolean(familyId) });
}

export function useMeUsage(enabled = true) {
  return useQuery({ queryKey: queryKeys.meUsage, queryFn: planetApi.me.usage, enabled });
}

export function useAlerts(familyId?: string) {
  return useQuery({ queryKey: queryKeys.alerts(familyId ?? ''), queryFn: () => planetApi.families.alerts(familyId as string), enabled: Boolean(familyId) });
}

export function useNotificationPrefs(familyId?: string) {
  return useQuery({ queryKey: queryKeys.notificationPrefs(familyId ?? ''), queryFn: () => planetApi.families.notificationPrefs(familyId as string), enabled: Boolean(familyId) });
}

export function useInvalidateApi() {
  const client = useQueryClient();
  return {
    me: () => client.invalidateQueries({ queryKey: queryKeys.me }),
    families: () => client.invalidateQueries({ queryKey: queryKeys.families }),
    deletedFamilies: () => client.invalidateQueries({ queryKey: queryKeys.deletedFamilies }),
    family: (familyId: string) => client.invalidateQueries({ queryKey: queryKeys.family(familyId) }),
    pets: (familyId: string) => client.invalidateQueries({ queryKey: queryKeys.pets(familyId) }),
    petsAll: () => client.invalidateQueries({ queryKey: ['pets'] }),
    pet: (petId: string) => client.invalidateQueries({ queryKey: queryKeys.pet(petId) }),
    today: (familyId: string) => client.invalidateQueries({ queryKey: ['today', familyId] }),
    todayAll: () => client.invalidateQueries({ queryKey: ['today'] }),
    timeline: (petId: string) => client.invalidateQueries({ queryKey: ['timeline', petId] }),
    medications: (petId: string) => client.invalidateQueries({ queryKey: queryKeys.medications(petId) }),
    // Pet surfaces request both the active-only and include-archived task lists.
    // Invalidate their shared prefix so a care-plan mutation cannot leave the
    // Pet header stale while Today has already refreshed.
    carePlans: (petId: string) => client.invalidateQueries({ queryKey: ['care-plans', petId] }),
    assignments: (carePlanId: string) => client.invalidateQueries({ queryKey: queryKeys.assignments(carePlanId) }),
    shares: (petId: string) => client.invalidateQueries({ queryKey: queryKeys.shares(petId) }),
    transfers: (familyId: string) => client.invalidateQueries({ queryKey: ['transfers', familyId] }),
    alerts: (familyId: string) => client.invalidateQueries({ queryKey: queryKeys.alerts(familyId) }),
    alertsAll: () => client.invalidateQueries({ queryKey: ['alerts'] }),
    notificationPrefs: (familyId: string) => client.invalidateQueries({ queryKey: queryKeys.notificationPrefs(familyId) }),
  };
}

export function useApiMutation<TVariables, TResult>(mutationFn: (variables: TVariables) => Promise<TResult>) {
  return useMutation({ mutationFn });
}
