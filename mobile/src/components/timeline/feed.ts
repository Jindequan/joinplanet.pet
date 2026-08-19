/**
 * Timeline feed data layer (contract F5, spec §27–§34, §63, §72).
 *
 * Local companions to src/lib/queries.ts: a filter-aware infinite feed
 * (queries.ts useTimeline has no `types` param), cache helpers that speak the
 * TanStack v5 InfiniteData shape, and create/delete mutations with
 * optimistic head-insert (spec §63).
 */
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { ApiError, del, get, post } from '../../lib/api';
import { ATTACHMENTS_ENABLED } from '../../lib/flags';
import {
  normalizeEvent as normalizeEventQ,
  qk,
  TIMELINE_PAGE_SIZE,
  type CreateEventInput,
  type TimelineEvent,
  type TimelinePage,
} from '../../lib/queries';

/* --------------------------------- Filters -------------------------------- */

export type TimelineFilterKey = 'all' | 'health' | 'symptom' | 'weight' | 'visit' | 'photo';

export interface TimelineFilter {
  key: TimelineFilterKey;
  label: string;
  /** Event types for `types=` (contract F5); empty = All. */
  types: string[];
}

/** User-facing filters never expose the raw database enum (spec §30). */
const BASE_FILTERS: TimelineFilter[] = [
  { key: 'all', label: 'All', types: [] },
  { key: 'health', label: 'Health', types: ['symptom', 'medication', 'vaccine'] },
  { key: 'symptom', label: 'Symptom', types: ['symptom'] },
  { key: 'weight', label: 'Weight', types: ['weight'] },
  { key: 'visit', label: 'Visit', types: ['visit'] },
  { key: 'photo', label: 'Photo', types: ['photo'] },
];

/** V1 无附件：Photo 筛选随 flag 隐藏（B6 翻转即恢复）。 */
export const TIMELINE_FILTERS: TimelineFilter[] = BASE_FILTERS.filter(
  (f) => ATTACHMENTS_ENABLED || f.key !== 'photo',
);

/**
 * "All" owns the shared base key (qk.timeline) so Pet-page derived readers
 * (e.g. latest weight) and any useTimeline observer share one cache; each
 * filter gets a scoped variant under the same prefix so timeline mutations
 * invalidate every view at once.
 */
export function timelineFeedKey(petId: string, types: string[]): QueryKey {
  return types.length === 0 ? qk.timeline(petId) : ['timeline', petId, types.join(',')];
}

/** TanStack v5 infinite-query cache shape. */
export interface TimelineFeedData {
  pages: TimelinePage[];
  pageParams: (string | null)[];
}

/**
 * Normalize a server event for client use: Postgres BIGSERIAL ids arrive as
 * JSON numbers while the app speaks string ids everywhere (routes, temp-
 * optimistic rows). Coerce once at the boundary.
 */
/** 服务端原始事件 → 客户端形状（payload→title/body 归一化在 queries 层）。 */
export function normalizeServerEvent(ev: Parameters<typeof normalizeEventQ>[0]): TimelineEvent {
  return normalizeEventQ(ev);
}

/**
 * Cursor-paginated feed（契约 v2）：`before=<occurred_at>&limit`，无 types 参数
 * —— 过滤在客户端做（宽容策略：服务端只增不改，客户端永不复制校验规则）。
 */
export function useTimelineFeed(petId: string | undefined, types: string[]) {
  return useInfiniteQuery({
    queryKey: timelineFeedKey(petId ?? '', types),
    queryFn: async ({ pageParam }) => {
      const parts: string[] = [];
      if (pageParam) parts.push(`before=${encodeURIComponent(pageParam)}`);
      parts.push(`limit=${TIMELINE_PAGE_SIZE * 2}`); // 过滤在前，多取一页
      const r = await get<{ events: Parameters<typeof normalizeServerEvent>[0][] }>(
        `/pets/${petId}/timeline?${parts.join('&')}`,
      );
      const all = r.events.map(normalizeServerEvent);
      const events = types.length > 0 ? all.filter((e) => types.includes(e.type)) : all;
      const oldest = all.length > 0 ? all[all.length - 1].occurred_at : null;
      return {
        events,
        next_cursor: oldest && all.length >= TIMELINE_PAGE_SIZE * 2 ? oldest : null,
      } satisfies TimelinePage;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last: TimelinePage) => last.next_cursor ?? undefined,
    enabled: !!petId,
  });
}

/* ------------------------------ Cache helpers ------------------------------ */

function unshiftIntoPages(data: TimelineFeedData, event: TimelineEvent): TimelineFeedData {
  return {
    ...data,
    pages: data.pages.map((page, index) =>
      index === 0 ? { ...page, events: [event, ...page.events] } : page,
    ),
  };
}

/** Insert at the head of one cached feed (spec §63 optimistic insert). */
export function insertEventIntoFeed(
  client: QueryClient,
  key: QueryKey,
  event: TimelineEvent,
): void {
  const data = client.getQueryData<TimelineFeedData>(key);
  // Never seed a wrong-shaped or empty cache — the query will fill it.
  if (!data || !Array.isArray(data.pages) || data.pages.length === 0) return;
  client.setQueryData<TimelineFeedData>(key, unshiftIntoPages(data, event));
}

/** Does a feed key (base or filtered variant) include this event type? */
function feedAllowsType(key: QueryKey, type: string): boolean {
  if (key.length <= 2) return true; // ['timeline', petId] — the All feed
  const types = typeof key[2] === 'string' ? key[2].split(',') : [];
  return types.includes(type);
}

/** Insert into every cached feed whose filter matches the event's type. */
export function insertEventIntoMatchingFeeds(
  client: QueryClient,
  petId: string,
  event: TimelineEvent,
): void {
  const entries = client.getQueriesData<TimelineFeedData>({ queryKey: qk.timeline(petId) });
  for (const [key, data] of entries) {
    if (!data || !Array.isArray(data.pages) || data.pages.length === 0) continue;
    if (!feedAllowsType(key, event.type)) continue;
    client.setQueryData<TimelineFeedData>(key, unshiftIntoPages(data, event));
  }
}

/** Drop an event (a temp optimistic id, or a deleted record) from every feed. */
export function removeEventFromFeeds(
  client: QueryClient,
  petId: string,
  eventId: string,
): void {
  const entries = client.getQueriesData<TimelineFeedData>({ queryKey: qk.timeline(petId) });
  for (const [key, data] of entries) {
    if (!data || !Array.isArray(data.pages)) continue;
    client.setQueryData<TimelineFeedData>(key, {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        events: page.events.filter((event) => event.id !== eventId),
      })),
    });
  }
}

/** Detail-page source of truth: find an event across every cached feed. */
export function findEventInCache(client: QueryClient, eventId: string): TimelineEvent | null {
  if (!eventId) return null;
  const entries = client.getQueriesData<TimelineFeedData>({ queryKey: ['timeline'] });
  for (const [, data] of entries) {
    for (const page of data?.pages ?? []) {
      const hit = page.events.find((event) => event.id === eventId);
      if (hit) return hit;
    }
  }
  return null;
}

/* -------------------------------- Mutations -------------------------------- */

export interface CreateTimelineEventInput {
  type: string;
  title: string;
  body?: string;
  occurred_at?: string;
  severity?: 'mild' | 'moderate' | 'severe';
  data?: Record<string, unknown>;
}

/**
 * POST /pets/{petID}/events with a head-insert on success + invalidation
 * (contract F5, spec §63). Behavior matches queries.ts useCreateEvent, but
 * the cache write respects the TanStack v5 InfiniteData shape.
 */
export function useCreateTimelineEvent(petId: string | undefined) {
  const client = useQueryClient();
  return useMutation<TimelineEvent, ApiError, CreateTimelineEventInput>({
    mutationFn: (input) =>
      post<{ event: Parameters<typeof normalizeServerEvent>[0] }>(
        `/pets/${petId}/timeline`,
        buildEventBody(input),
      ).then((r) => normalizeServerEvent(r.event)),
    onSuccess: (event) => {
      if (!petId) return;
      insertEventIntoMatchingFeeds(client, petId, event);
      void client.invalidateQueries({ queryKey: qk.timeline(petId) });
    },
  });
}

/** DELETE /events/{eventID} — optimistic removal, invalidate on settle (F5). */
export function useDeleteTimelineEvent(petId: string | undefined) {
  const client = useQueryClient();
  return useMutation<unknown, ApiError, { eventId: string }>({
    mutationFn: ({ eventId }) => del(`/timeline-events/${eventId}`),
    onMutate: ({ eventId }) => {
      if (petId) removeEventFromFeeds(client, petId, eventId);
    },
    onError: () => {
      // roll the optimistic removal back via refetch (spec §63)
      if (petId) void client.invalidateQueries({ queryKey: qk.timeline(petId) });
    },
    onSettled: () => {
      if (petId) void client.invalidateQueries({ queryKey: qk.timeline(petId) });
    },
  });
}


/** 屏幕输入 → 契约 v2 请求体（type + occurred_at + payload）。 */
function buildEventBody(input: CreateTimelineEventInput): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...(input.data ?? {}) };
  switch (input.type) {
    case 'symptom':
      if (input.title) payload.title = input.title;
      if (input.body) payload.detail = input.body;
      if (input.severity) payload.severity = input.severity;
      break;
    case 'note':
      if (input.body ?? input.title) payload.text = input.body ?? input.title;
      break;
    case 'vaccine':
      if (input.title) payload.name = input.title;
      break;
    case 'vet_visit':
      if (input.title) payload.title = input.title;
      if (input.body) payload.summary = input.body;
      break;
    case 'photo':
      if (input.title) payload.title = input.title;
      break;
    case 'weight':
      if (input.body) payload.weight_g = Math.round(parseFloat(input.body) * 1000);
      break;
    default:
      if (input.title) payload.title = input.title;
      if (input.body) payload.text = input.body;
  }
  return {
    type: input.type === 'visit' ? 'vet_visit' : input.type,
    occurred_at: input.occurred_at ?? new Date().toISOString(),
    payload,
  };
}
