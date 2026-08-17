/**
 * TanStack Query layer — query key factory + hooks/mutations per API contract v1
 * and spec §63 (optimistic UI), §21 (409 conflict adoption), §68–§72 (server state).
 */
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import dayjs from 'dayjs';
import { ApiError, del, get, patch, post } from './api';

/* ------------------------------- API types ------------------------------- */

export interface User {
  id: string;
  email: string;
  display_name: string;
}

export interface PetSummary {
  id: string;
  name: string;
  species?: string;
  breed?: string;
  birthday?: string;
  avatar_key?: string;
}

export interface Circle {
  id: string;
  name: string;
  timezone?: string;
  role?: string;
  pet?: PetSummary;
}

export interface Me {
  user: User;
  circles: Circle[];
  entitlements: string[];
}

export interface Pet {
  id: string;
  name: string;
  species?: string;
  breed?: string;
  birthday?: string;
  allergies?: string[];
  conditions?: string[];
  emergency_contacts?: { primary?: string; vet?: string; authorized_decision_maker?: string };
  notes?: string;
  avatar_key?: string;
}

export interface TaskLog {
  status: 'done' | 'skipped';
  by_user_id?: string;
  by_name?: string;
  at: string;
  note?: string;
}

export interface TodayTask {
  id: string;
  title: string;
  time_of_day: string;
  note?: string;
  medication_id?: string;
  log: TaskLog | null;
}

export interface TodayResponse {
  date: string;
  tasks: TodayTask[];
}

export interface Attachment {
  id: string;
  kind: string;
  url: string;
  filename?: string;
}

export type TimelineEventType =
  | 'note'
  | 'symptom'
  | 'weight'
  | 'visit'
  | 'photo'
  | 'medication'
  | string;

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  occurred_at: string;
  title: string;
  body?: string;
  severity?: 'mild' | 'moderate' | 'severe' | string;
  data?: Record<string, unknown>;
  recorded_by?: string;
  by_name?: string;
  source?: string;
  attachments?: Attachment[];
}

export interface TimelinePage {
  events: TimelineEvent[];
  next_cursor: string | null;
}

export interface Medication {
  id: string;
  name: string;
  dose?: string;
  schedule?: string;
  note?: string;
  active?: boolean;
  started_on?: string;
  ended_on?: string;
}

export interface MedicationsResponse {
  active: Medication[];
  past: Medication[];
}

export interface Share {
  id: string;
  kind: 'summary' | 'care' | string;
  url: string;
  expires_at: string;
  revoked_at?: string | null;
  view_count: number;
  status: 'active' | 'expired' | 'revoked';
}

export interface CircleMember {
  user_id: string;
  display_name: string;
  email: string;
  role: string;
  joined_at: string;
}

/* ------------------------------ Key factory ------------------------------ */

export const qk = {
  me: ['me'] as const,
  today: (petId: string, date: string) => ['today', petId, date] as const,
  timeline: (petId: string) => ['timeline', petId] as const,
  pet: (petId: string) => ['pet', petId] as const,
  medications: (petId: string) => ['medications', petId] as const,
  circle: (circleId: string) => ['circle', circleId] as const,
  shares: (petId: string) => ['shares', petId] as const,
};

export const TIMELINE_PAGE_SIZE = 30;

/* -------------------------------- Queries -------------------------------- */

export function useMe(enabled = true) {
  return useQuery({
    queryKey: qk.me,
    queryFn: () => get<Me>('/me'),
    enabled,
    staleTime: 60_000,
  });
}

/** Convenience: the "active" pet of the first circle (Phase 1 is single-pet, spec §11). */
export function useActivePet() {
  const { data, ...rest } = useMe();
  const pet = data?.circles.find((c) => c.pet)?.pet ?? null;
  return { pet, circle: data?.circles.find((c) => c.pet) ?? null, ...rest };
}

export function useToday(petId: string | undefined, date?: string) {
  const day = date ?? dayjs().format('YYYY-MM-DD');
  return useQuery({
    queryKey: qk.today(petId ?? '', day),
    queryFn: () => get<TodayResponse>(`/pets/${petId}/today?date=${day}`),
    enabled: !!petId,
  });
}

export function useTimeline(petId: string | undefined) {
  return useInfiniteQuery({
    queryKey: qk.timeline(petId ?? ''),
    queryFn: async ({ pageParam }) => {
      const before = pageParam ? `?before=${pageParam}` : '';
      const page = await get<TimelinePage>(
        `/pets/${petId}/timeline${before}${before ? '&' : '?'}limit=${TIMELINE_PAGE_SIZE}`,
      );
      // Normalize ids to strings (server sends numeric BIGSERIAL ids) and
      // keep the cache shape consistent with the timeline feed layer.
      return {
        events: page.events.map((ev) => ({ ...ev, id: String(ev.id) })),
        next_cursor: page.next_cursor == null ? null : String(page.next_cursor),
      } satisfies TimelinePage;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last: TimelinePage) => last.next_cursor ?? undefined,
    enabled: !!petId,
  });
}

export function usePet(petId: string | undefined) {
  return useQuery({
    queryKey: qk.pet(petId ?? ''),
    queryFn: () => get<{ pet: Pet }>(`/pets/${petId}`).then((r) => r.pet),
    enabled: !!petId,
  });
}

export function useMedications(petId: string | undefined) {
  return useQuery({
    queryKey: qk.medications(petId ?? ''),
    queryFn: () => get<MedicationsResponse>(`/pets/${petId}/medications`),
    enabled: !!petId,
  });
}

export function useShares(petId: string | undefined) {
  return useQuery({
    queryKey: qk.shares(petId ?? ''),
    queryFn: () => get<{ shares: Share[] }>(`/pets/${petId}/shares`).then((r) => r.shares),
    enabled: !!petId,
  });
}

/* ------------------------- Timeline cache helpers ------------------------ */

/** Insert an event at the head of the cached timeline (spec §63 optimistic insert). */
export function insertTimelineEvent(
  client: ReturnType<typeof useQueryClient>,
  petId: string,
  event: TimelineEvent,
): void {
  // TanStack v5 stores infinite queries as { pages, pageParams } — write
  // through that structure, creating it on first insert.
  client.setQueryData<{ pages: TimelinePage[]; pageParams: unknown[] }>(
    qk.timeline(petId),
    (data) => {
      if (!data || data.pages.length === 0) {
        return { pages: [{ events: [event], next_cursor: null }], pageParams: [undefined] };
      }
      const pages = data.pages.map((p) => ({ ...p, events: [...p.events] }));
      pages[0].events.unshift(event);
      return { ...data, pages };
    },
  );
}

/* ------------------------------- Mutations ------------------------------- */

type TodayCache = TodayResponse | undefined;

interface TaskLogVars {
  taskId: string;
  note?: string;
  date?: string;
}

interface TaskLogContext {
  day: string;
  previous: TodayCache;
}

function patchTodayTask(
  client: ReturnType<typeof useQueryClient>,
  petId: string,
  date: string,
  taskId: string,
  log: TaskLog | null,
): void {
  client.setQueryData<TodayResponse>(qk.today(petId, date), (prev) => {
    if (!prev) return prev;
    return {
      ...prev,
      tasks: prev.tasks.map((t) => (t.id === taskId ? { ...t, log } : t)),
    };
  });
}

/**
 * POST /tasks/{taskID}/log — done/skipped share this helper.
 * On 409 (concurrent completion, contract F4 / spec §21) the server returns the
 * authoritative log; we adopt it silently instead of surfacing an error.
 */
function useTaskLogMutation(
  petId: string | undefined,
  date: string,
  status: 'done' | 'skipped',
): UseMutationResult<
  { log: TaskLog } | void,
  ApiError,
  TaskLogVars,
  TaskLogContext | undefined
> {
  const client = useQueryClient();
  return useMutation<{ log: TaskLog } | void, ApiError, TaskLogVars, TaskLogContext | undefined>({
    mutationFn: async (vars) => {
      try {
        return await post<{ log: TaskLog }>(`/tasks/${vars.taskId}/log`, {
          status,
          note: vars.note,
          date: vars.date ?? date,
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          const authoritative = (err.data as { log?: TaskLog } | null)?.log;
          if (authoritative) return { log: authoritative }; // adopt, don't throw
        }
        throw err;
      }
    },
    onMutate: async (vars): Promise<TaskLogContext | undefined> => {
      if (!petId) return undefined;
      const day = vars.date ?? date;
      await client.cancelQueries({ queryKey: qk.today(petId, day) });
      const previous = client.getQueryData<TodayResponse>(qk.today(petId, day));
      patchTodayTask(client, petId, day, vars.taskId, {
        status,
        by_name: 'You',
        at: new Date().toISOString(),
        note: vars.note,
      });
      return { day, previous };
    },
    onError: (_err, _vars, ctx) => {
      if (petId && ctx) {
        client.setQueryData(qk.today(petId, ctx.day), ctx.previous); // roll back (spec §63)
      }
    },
    onSettled: (_data, _err, vars, ctx) => {
      if (!petId) return;
      const day = ctx?.day ?? vars?.date ?? date;
      void client.invalidateQueries({ queryKey: qk.today(petId, day) });
    },
  });
}

export function useCompleteTask(petId: string | undefined, date?: string) {
  const day = date ?? dayjs().format('YYYY-MM-DD');
  return useTaskLogMutation(petId, day, 'done');
}

export function useSkipTask(petId: string | undefined, date?: string) {
  const day = date ?? dayjs().format('YYYY-MM-DD');
  return useTaskLogMutation(petId, day, 'skipped');
}

/** DELETE /tasks/{taskID}/log?date= — undo. */
export function useUndoLog(petId: string | undefined, date?: string) {
  const client = useQueryClient();
  const day = date ?? dayjs().format('YYYY-MM-DD');
  return useMutation<unknown, ApiError, { taskId: string; date?: string }>({
    mutationFn: (vars) => del(`/tasks/${vars.taskId}/log?date=${vars.date ?? day}`),
    onMutate: async (vars) => {
      if (!petId) return;
      const d = vars.date ?? day;
      await client.cancelQueries({ queryKey: qk.today(petId, d) });
      patchTodayTask(client, petId, d, vars.taskId, null);
    },
    onError: () => {
      if (petId) void client.invalidateQueries({ queryKey: qk.today(petId, day) });
    },
    onSettled: () => {
      if (petId) void client.invalidateQueries({ queryKey: qk.today(petId, day) });
    },
  });
}

export interface CreateEventInput {
  type: TimelineEventType;
  title: string;
  body?: string;
  occurred_at?: string;
  severity?: 'mild' | 'moderate' | 'severe';
  data?: Record<string, unknown>;
}

/** POST /pets/{petID}/events — returns the created event for optimistic insert. */
export function useCreateEvent(petId: string | undefined) {
  const client = useQueryClient();
  return useMutation<TimelineEvent, ApiError, CreateEventInput>({
    mutationFn: (input) =>
      post<{ event: TimelineEvent }>(`/pets/${petId}/events`, {
        type: input.type,
        title: input.title,
        body: input.body,
        occurred_at: input.occurred_at ?? new Date().toISOString(),
        severity: input.severity,
        data: input.data,
      }).then((r) => ({ ...r.event, id: String(r.event.id) })),
    onSuccess: (event) => {
      if (petId) {
        insertTimelineEvent(client, petId, event);
        void client.invalidateQueries({ queryKey: qk.timeline(petId) });
      }
    },
  });
}

export interface CreateTaskInput {
  title: string;
  time_of_day: string;
  note?: string;
  medication_id?: string;
}

/** POST /pets/{petID}/tasks. */
export function useCreateTask(petId: string | undefined, date?: string) {
  const client = useQueryClient();
  const day = date ?? dayjs().format('YYYY-MM-DD');
  return useMutation<unknown, ApiError, CreateTaskInput>({
    mutationFn: (input) => post(`/pets/${petId}/tasks`, input),
    onSettled: () => {
      if (petId) {
        void client.invalidateQueries({ queryKey: qk.today(petId, day) });
        void client.invalidateQueries({ queryKey: qk.timeline(petId) });
      }
    },
  });
}

/** POST /pets/{petID}/attachments — multipart upload bound to an event (contract F5). */
export function useUploadAttachment(petId: string | undefined) {
  return useMutation<Attachment, ApiError, { form: FormData }>({
    mutationFn: ({ form }) =>
      post<{ attachment: Attachment }>(`/pets/${petId}/attachments`, form).then(
        (r) => r.attachment,
      ),
  });
}

/** PATCH /events/{eventID} / DELETE /events/{eventID} helpers for later screens. */
export function useUpdateEvent(petId: string | undefined) {
  const client = useQueryClient();
  return useMutation<
    TimelineEvent,
    ApiError,
    { eventId: string; patch: Partial<Pick<TimelineEvent, 'title' | 'body' | 'severity'>> }
  >({
    mutationFn: ({ eventId, patch: p }) =>
      patch<{ event: TimelineEvent }>(`/events/${eventId}`, p).then((r) => ({
        ...r.event,
        id: String(r.event.id),
      })),
    onSettled: () => {
      if (petId) void client.invalidateQueries({ queryKey: qk.timeline(petId) });
    },
  });
}
