import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { planetApi, type Alert, type TodayPet } from '../api/planet-api';
import { queryKeys } from './keys';

export function useMe(enabled = true) {
  return useQuery({ queryKey: queryKeys.me, queryFn: planetApi.me.get, enabled });
}

export function useCircles(enabled = true) {
  return useQuery({ queryKey: queryKeys.circles, queryFn: planetApi.circles.list, enabled });
}

export function useCircle(circleId?: string) {
  return useQuery({ queryKey: queryKeys.circle(circleId ?? ''), queryFn: () => planetApi.circles.detail(circleId as string), enabled: Boolean(circleId) });
}

export function useCirclePets(circleId?: string) {
  return useQuery({ queryKey: queryKeys.pets(circleId ?? ''), queryFn: () => planetApi.pets.list(circleId as string), enabled: Boolean(circleId) });
}

export function useAccessiblePets(circleIds: string[]) {
  const accessible = useQuery({ queryKey: queryKeys.accessiblePets, queryFn: planetApi.pets.listAccessible });
  const queries = useQueries({
    queries: circleIds.map((circleId) => ({
      queryKey: queryKeys.pets(circleId),
      queryFn: () => planetApi.pets.list(circleId),
    })),
  });
  const petsById = new Map<string, NonNullable<(typeof queries)[number]['data']>['pets'][number]>();
  queries.forEach((query) => query.data?.pets.forEach((pet) => petsById.set(pet.id, pet)));
  accessible.data?.pets.forEach((pet) => petsById.set(pet.id, pet));
  return {
    pets: [...petsById.values()],
    isLoading: accessible.isLoading || queries.some((query) => query.isLoading),
    isError: accessible.isError || queries.some((query) => query.isError),
    hasData: accessible.data !== undefined || queries.some((query) => query.data !== undefined),
    refetch: () => Promise.all([accessible.refetch(), ...queries.map((query) => query.refetch())]),
  };
}

export function usePet(petId?: string) {
  return useQuery({ queryKey: queryKeys.pet(petId ?? ''), queryFn: () => planetApi.pets.get(petId as string), enabled: Boolean(petId) });
}

export function useToday(circleId?: string, date = '') {
  return useQuery({ queryKey: queryKeys.today(circleId ?? '', date), queryFn: () => planetApi.circles.today(circleId as string, date || undefined), enabled: Boolean(circleId) });
}

export function useTodayForCircles(circleIds: string[], date: string | Record<string, string> = '', directPetIds: string[] = [], directDate = '') {
  const queries = useQueries({
    queries: circleIds.map((circleId) => {
      const circleDate = typeof date === 'string' ? date : date[circleId] ?? '';
      return {
      queryKey: queryKeys.today(circleId, circleDate),
      queryFn: () => planetApi.circles.today(circleId, circleDate || undefined),
      };
    }),
  });
  const directQueries = useQueries({
    queries: directPetIds.map((petId) => ({
      queryKey: ['today', 'pet', petId, directDate],
      queryFn: () => planetApi.pets.today(petId, directDate || undefined),
    })),
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

export function useTasks(petId?: string, includeArchived = false) {
  return useQuery({ queryKey: queryKeys.tasks(petId ?? '', includeArchived), queryFn: () => planetApi.pets.tasks(petId as string, includeArchived), enabled: Boolean(petId) });
}

export function useTodayForPet(petId?: string, date = '') {
  return useQuery({ queryKey: queryKeys.todayPet(petId ?? '', date), queryFn: () => planetApi.pets.today(petId as string, date || undefined), enabled: Boolean(petId) });
}

export function useCareAssignments(careItemId?: string) {
  return useQuery({ queryKey: queryKeys.assignments(careItemId ?? ''), queryFn: () => planetApi.tasks.assignments(careItemId as string), enabled: Boolean(careItemId) });
}

export function usePetShares(petId?: string, enabled = true) {
  return useQuery({ queryKey: queryKeys.shares(petId ?? ''), queryFn: () => planetApi.pets.shares(petId as string), enabled: Boolean(petId) && enabled });
}

export function useTransfers(circleId?: string, direction: 'incoming' | 'outgoing' = 'incoming') {
  return useQuery({ queryKey: queryKeys.transfers(circleId ?? '', direction), queryFn: () => planetApi.transfers.list(circleId as string, direction), enabled: Boolean(circleId) });
}

export function useAlertsForCircles(circleIds: string[]) {
  const queries = useQueries({
    queries: circleIds.map((circleId) => ({
      queryKey: queryKeys.alerts(circleId),
      queryFn: () => planetApi.circles.alerts(circleId),
    })),
  });
  const alerts: Alert[] = [];
  queries.forEach((query) => { if (query.data?.alerts) alerts.push(...query.data.alerts); });
  alerts.sort((left, right) => new Date(right.occurred_at).getTime() - new Date(left.occurred_at).getTime());
  return {
    alerts,
    isLoading: queries.some((query) => query.isLoading),
    isError: queries.some((query) => query.isError),
    hasData: queries.some((query) => query.data !== undefined),
    refetch: () => Promise.all(queries.map((query) => query.refetch())),
  };
}

export function useCircleUsage(circleId?: string) {
  return useQuery({ queryKey: queryKeys.usage(circleId ?? ''), queryFn: () => planetApi.circles.usage(circleId as string), enabled: Boolean(circleId) });
}

export function useMeUsage(enabled = true) {
  return useQuery({ queryKey: queryKeys.meUsage, queryFn: planetApi.me.usage, enabled });
}

export function useAlerts(circleId?: string) {
  return useQuery({ queryKey: queryKeys.alerts(circleId ?? ''), queryFn: () => planetApi.circles.alerts(circleId as string), enabled: Boolean(circleId) });
}

export function useNotificationPrefs(circleId?: string) {
  return useQuery({ queryKey: queryKeys.notificationPrefs(circleId ?? ''), queryFn: () => planetApi.circles.notificationPrefs(circleId as string), enabled: Boolean(circleId) });
}

export function useInvalidateApi() {
  const client = useQueryClient();
  return {
    me: () => client.invalidateQueries({ queryKey: queryKeys.me }),
    circles: () => client.invalidateQueries({ queryKey: queryKeys.circles }),
    circle: (circleId: string) => client.invalidateQueries({ queryKey: queryKeys.circle(circleId) }),
    pets: (circleId: string) => client.invalidateQueries({ queryKey: queryKeys.pets(circleId) }),
    petsAll: () => client.invalidateQueries({ queryKey: ['pets'] }),
    pet: (petId: string) => client.invalidateQueries({ queryKey: queryKeys.pet(petId) }),
    today: (circleId: string) => client.invalidateQueries({ queryKey: ['today', circleId] }),
    todayAll: () => client.invalidateQueries({ queryKey: ['today'] }),
    timeline: (petId: string) => client.invalidateQueries({ queryKey: ['timeline', petId] }),
    medications: (petId: string) => client.invalidateQueries({ queryKey: queryKeys.medications(petId) }),
    tasks: (petId: string) => client.invalidateQueries({ queryKey: queryKeys.tasks(petId) }),
    assignments: (careItemId: string) => client.invalidateQueries({ queryKey: queryKeys.assignments(careItemId) }),
    shares: (petId: string) => client.invalidateQueries({ queryKey: queryKeys.shares(petId) }),
    transfers: (circleId: string) => client.invalidateQueries({ queryKey: ['transfers', circleId] }),
    alerts: (circleId: string) => client.invalidateQueries({ queryKey: queryKeys.alerts(circleId) }),
    alertsAll: () => client.invalidateQueries({ queryKey: ['alerts'] }),
    notificationPrefs: (circleId: string) => client.invalidateQueries({ queryKey: queryKeys.notificationPrefs(circleId) }),
  };
}

export function useApiMutation<TVariables, TResult>(mutationFn: (variables: TVariables) => Promise<TResult>) {
  return useMutation({ mutationFn });
}
