/**
 * TanStack Query 层 —— 对接 planet-api（API-CONTRACT v2）。
 * 设计规则（FRONTEND-V1-PLAN §1）：
 *  - 解释权在服务端：Today 展开结果、配额、事件合法性直接消费，不在客户端复算
 *  - 宽容解析：未知事件类型/错误码降级（normalizeEvent 通用卡 + err.code fallback）
 *  - 409 TASK_LOG_EXISTS 静默采用权威 log（err.data.log）
 *  - 配额文案只读服务端 usage 载荷，不写死数字
 * 旧导出名（Me/Pet/TaskLog/...）保留为客户端归一化形状，屏幕层少改动。
 */
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useCallback, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { ApiError, del, get, patch, post } from './api';
import { queryClient } from './query-client';
import type {
  CircleDTO, CircleDetailDTO, EntitlementDTO, MeDTO, MedicationDTO, PetDTO,
  PetTransferDTO, PetWithProfileDTO, ProfileDTO, ShareDTO, TaskDTO, TaskLogDTO,
  TodayPetGroupDTO, TodayResponseDTO, UsageDTO, CircleMemberDTO,
} from './types';

export type { CircleMemberDTO as CircleMember, ShareDTO as ShareRaw } from './types';

/* ------------------------- 客户端归一化形状（兼容层） ------------------------- */

export interface User {
  id: string;
  email: string;
  display_name: string;
}

export interface Me {
  user: User;
  entitlements: EntitlementDTO[];
}

export interface Circle {
  id: string;
  name: string;
  timezone?: string;
  role?: string;
}

export interface PetSummary {
  id: string;
  name: string;
  species?: string;
  breed?: string;
  birth_date?: string | null;
  archived_at?: string | null;
  /** 兼容字段：V1 无附件恒为空 */
  avatar_key?: string;
}

/** 屏幕层使用的宠物形状：pet + profile 合并（allergies 等取 name 字符串数组） */
export interface Pet {
  id: string;
  circle_id: string;
  name: string;
  species?: string;
  breed?: string;
  birthday?: string | null;
  sex?: string;
  neutered?: boolean;
  weight_g?: number | null;
  archived?: boolean;
  archived_at?: string | null;
  version?: number;
  allergies: string[];
  conditions: string[];
  /** 原始档案（编辑回写用，保留结构化字段） */
  profile_raw: ProfileDTO;
  notes: string;
  /** 兼容字段：V1 无附件，恒为空 */
  avatar_key?: string;
  /** 兼容形状（旧屏用）：紧急联系人三段式，由 profile_raw 推导（对象含 name/phone） */
  emergency_contacts: {
    primary?: { name?: string; phone?: string; note?: string } | null;
    vet?: { name?: string; phone?: string; note?: string } | null;
    authorized_decision_maker?: { name?: string; phone?: string; note?: string } | null;
  };
}

export interface TaskLog {
  id?: string;
  status: 'done' | 'skipped' | string;
  by_user_id?: string | null;
  by_name?: string;
  at: string;
  note?: string;
  log_date?: string;
}

export interface TodayTask {
  id: string;
  pet_id: string;
  title: string;
  time_of_day: string;
  schedule?: TaskDTO['schedule'];
  log: TaskLog | null;
  /** 兼容字段（旧屏） */
  note?: string;
  medication_id?: string;
}

export interface TodayPetGroup {
  pet_id: string;
  pet_name: string;
  tasks: TodayTask[];
}

export interface TodayResponse {
  date: string;
  groups: TodayPetGroup[];
}

export type TimelineEventType =
  | 'note' | 'symptom' | 'weight' | 'vaccine' | 'vet_visit'
  | 'document' | 'medication' | 'transfer' | string;

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  occurred_at: string;
  title: string;
  body?: string;
  severity?: string;
  data?: Record<string, unknown>;
  recorded_by?: string | null;
  by_name?: string;
  source?: string;
  edited_at?: string | null;
  /** 兼容字段：V1 无附件，恒为空数组 */
  attachments?: { id?: string; url: string; filename?: string; kind?: string }[];
}

export interface TimelinePage {
  events: TimelineEvent[];
  /** 下一页游标：最后一页最旧事件的 occurred_at（服务端 before 分页） */
  next_cursor: string | null;
}

export interface Medication {
  id: string;
  name: string;
  dose?: string;
  schedule?: string;
  note?: string;
  active: boolean;
  started_on?: string;
  ended_on?: string | null;
}

export interface Share {
  id: string;
  kind: 'care_card' | 'summary' | string;
  /** 仅创建响应携带（token 一次性）；列表项恒为空 */
  url?: string;
  expires_at: string;
  revoked_at?: string | null;
  view_count: number;
  last_viewed_at?: string | null;
  created_at?: string;
  status: 'active' | 'expired' | 'revoked';
}

export interface ShareRecord {
  share: Share;
  /** 仅创建时存在：明文 token（一次性）与查看地址 */
  token?: string;
  url?: string;
}

/* ------------------------------- 归一化器 ------------------------------- */

function normalizeLog(l: TaskLogDTO | null): TaskLog | null {
  if (!l) return null;
  return {
    id: l.id,
    status: l.status,
    by_user_id: l.done_by ?? undefined,
    by_name: l.done_by_name ?? undefined,
    at: l.done_at,
    note: l.note,
    log_date: l.log_date,
  };
}

/** payload → 展示字段。未知类型 → 通用卡（前向兼容 B6 附件/AI 事件）。 */
export function normalizeEvent(ev: {
  id: string;
  type: string;
  occurred_at: string;
  payload?: Record<string, unknown>;
  recorded_by?: string | null;
  source?: string;
  edited_at?: string | null;
  /** 兼容字段：V1 无附件，恒为空数组 */
  attachments?: { id?: string; url: string; filename?: string; kind?: string }[];
}): TimelineEvent {
  const p = ev.payload ?? {};
  const str = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : undefined);
  const num = (k: string) => (typeof p[k] === 'number' ? (p[k] as number) : undefined);
  let title = '';
  let body: string | undefined;
  let severity: string | undefined;
  const data: Record<string, unknown> = { ...p };
  switch (ev.type) {
    case 'symptom':
      title = str('title') ?? 'Health record';
      body = str('detail') ?? str('body');
      severity = str('severity');
      break;
    case 'weight': {
      const g = num('weight_g');
      title = g != null ? `${(g / 1000).toFixed(2)} kg` : 'Weight';
      body = str('note');
      break;
    }
    case 'vaccine': {
      title = str('name') ?? 'Vaccine';
      // 写入端用 next_due（quick-input/pet 页提醒卡一致）；due 为历史兼容
      const dueDate = str('next_due') ?? str('due');
      body = dueDate ? `Next due ${dueDate}` : str('note');
      break;
    }
    case 'vet_visit':
      title = str('title') ?? 'Vet visit';
      body = [str('clinic'), str('summary')].filter(Boolean).join(' · ') || undefined;
      break;
    case 'note':
      body = str('text');
      title = str('title') ?? 'Note';
      break;
    case 'medication':
      title = str('name') ?? 'Medication';
      body = str('action') === 'ended' ? 'Medication ended' : 'Medication started';
      break;
    case 'transfer':
      title = 'Joined this family';
      body = 'Transferred from another family';
      break;
    default:
      title = ev.type; // 未知类型：通用卡（标题=类型名，payload 保留在 data）
      body = str('text') ?? str('title');
  }
  return {
    id: String(ev.id),
    type: ev.type,
    occurred_at: ev.occurred_at,
    title,
    body,
    severity,
    data,
    recorded_by: ev.recorded_by ?? undefined,
    source: ev.source,
    edited_at: ev.edited_at ?? null,
  };
}

function mergePet(pet: PetDTO, profile: ProfileDTO | undefined): Pet {
  return {
    id: pet.id,
    circle_id: pet.circle_id,
    name: pet.name,
    species: pet.species,
    breed: pet.breed,
    birthday: pet.birth_date ?? undefined,
    sex: pet.sex,
    neutered: pet.neutered,
    weight_g: pet.weight_g ?? undefined,
    archived: !!pet.archived_at,
    archived_at: pet.archived_at ?? null,
    version: pet.version,
    allergies: (profile?.allergies ?? []).map((a) => a.name),
    conditions: (profile?.conditions ?? []).map((c) => c.name),
    profile_raw: profile ?? {},
    notes: profile?.notes ?? '',
    avatar_key: undefined,
    emergency_contacts: {
      primary: profile?.emergency_contacts?.[0] ?? null,
      vet: profile?.emergency_contacts?.find((c) => /vet|医/i.test(c.relation ?? '')) ?? null,
      authorized_decision_maker: profile?.med_decision_maker ?? null,
    },
  };
}

function normalizeShare(s: ShareDTO): Share {
  const now = Date.now();
  const expired = new Date(s.expires_at).getTime() < now;
  const revoked = !!s.revoked_at;
  return {
    id: s.id,
    kind: s.kind,
    expires_at: s.expires_at,
    revoked_at: s.revoked_at ?? null,
    view_count: s.view_count ?? 0,
    last_viewed_at: s.last_viewed_at ?? null,
    created_at: s.created_at,
    status: revoked ? 'revoked' : expired ? 'expired' : 'active',
  };
}

function normalizeMedication(m: MedicationDTO): Medication {
  return {
    id: m.id,
    name: m.name,
    dose: m.dose,
    schedule: m.schedule,
    note: m.note,
    active: !m.ended_on,
    started_on: m.started_on,
    ended_on: m.ended_on ?? null,
  };
}

/* ------------------------------ Key factory ------------------------------ */

export const qk = {
  me: ['me'] as const,
  circles: ['circles'] as const,
  circle: (circleId: string) => ['circle', circleId] as const,
  circlePets: (circleId: string) => ['circle', circleId, 'pets'] as const,
  today: (circleId: string, date: string) => ['circle', circleId, 'today', date] as const,
  usage: (circleId: string) => ['circle', circleId, 'usage'] as const,
  transfers: (circleId: string, dir: string) => ['circle', circleId, 'transfers', dir] as const,
  pet: (petId: string) => ['pet', petId] as const,
  timeline: (petId: string) => ['timeline', petId] as const,
  medications: (petId: string) => ['medications', petId] as const,
  shares: (petId: string) => ['shares', petId] as const,
};

export const TIMELINE_PAGE_SIZE = 30;

/* -------------------------------- 基础查询 -------------------------------- */

export function useMe(enabled = true) {
  return useQuery({
    queryKey: qk.me,
    queryFn: () => get<MeDTO>('/me'),
    enabled,
    staleTime: 60_000,
  });
}

export function useCircles(enabled = true) {
  return useQuery({
    queryKey: qk.circles,
    queryFn: () => get<{ circles: CircleDTO[] }>('/circles').then((r) => r.circles),
    enabled,
  });
}

export function useCircleDetail(circleId: string | undefined) {
  return useQuery({
    queryKey: qk.circle(circleId ?? ''),
    queryFn: () => get<CircleDetailDTO>(`/circles/${circleId}`),
    enabled: !!circleId,
  });
}

export function useCirclePets(circleId: string | undefined) {
  return useQuery({
    queryKey: qk.circlePets(circleId ?? ''),
    queryFn: () =>
      get<{ pets: PetDTO[] }>(`/circles/${circleId}/pets`).then((r) => r.pets),
    enabled: !!circleId,
  });
}

export function useUsage(circleId: string | undefined) {
  return useQuery({
    queryKey: qk.usage(circleId ?? ''),
    queryFn: () => get<UsageDTO>(`/circles/${circleId}/usage`),
    enabled: !!circleId,
  });
}

/* --------------------------- 活跃圈 / 活跃宠物 --------------------------- */

const ACTIVE_PET_KEY = 'planet_active_pet';
const ACTIVE_CIRCLE_KEY = 'planet_active_circle';

function makeSingleton(storeKey: string) {
  let value: string | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  async function persist(id: string | null) {
    try {
      if (Platform.OS === 'web') {
        if (id) window.localStorage.setItem(storeKey, id);
        else window.localStorage.removeItem(storeKey);
        return;
      }
      if (id) await SecureStore.setItemAsync(storeKey, id);
      else await SecureStore.deleteItemAsync(storeKey);
    } catch {
      // ignore
    }
  }
  void (async () => {
    try {
      const stored =
        Platform.OS === 'web'
          ? window.localStorage.getItem(storeKey)
          : await SecureStore.getItemAsync(storeKey);
      if (stored && !value) value = stored;
    } catch {
      // unreadable — fall back to first
    } finally {
      notify();
    }
  })();
  return {
    use: () =>
      useSyncExternalStore(
        (onChange) => {
          listeners.add(onChange);
          return () => listeners.delete(onChange);
        },
        () => value,
      ),
    set: (id: string | null) => {
      if (value === id) return;
      value = id;
      void persist(id);
      notify();
    },
  };
}

const activeCircle = makeSingleton(ACTIVE_CIRCLE_KEY);
const activePet = makeSingleton(ACTIVE_PET_KEY);

/**
 * 活跃宠物（多宠 M1）：me → 圈列表 → 选中圈的全部宠物。
 * 圈无 pet 概念后由两个查询组合；选中项持久化，失效时回退第一只。
 */
export function useActivePet() {
  const selectedCircleId = activeCircle.use();
  const selectedPetId = activePet.use();
  const circlesQuery = useCircles();
  const circles = circlesQuery.data;
  const circle =
    (selectedCircleId != null ? circles?.find((c) => c.id === selectedCircleId) : undefined) ??
    circles?.[0] ??
    null;
  const petsQuery = useCirclePets(circle?.id);
  // 列表层用合并形状（档案另查 usePet）；archived/birthday 归一化
  const pets = (petsQuery.data ?? []).map((p) => mergePet(p, undefined));
  const pet =
    (selectedPetId != null ? pets.find((p) => p.id === selectedPetId) : undefined) ??
    pets[0] ??
    null;

  const selectPet = useCallback((petId: string) => {
    activePet.set(petId);
    void queryClient.invalidateQueries({ queryKey: qk.circles });
  }, []);
  const selectCircle = useCallback((circleId: string) => {
    activeCircle.set(circleId);
    activePet.set(null); // 重置宠物选择，回退到新圈第一只
    void queryClient.invalidateQueries({ queryKey: qk.circles });
  }, []);

  return {
    pet,
    circle,
    pets,
    circles: circles ?? [],
    selectPet,
    selectCircle,
    loading: circlesQuery.isLoading || petsQuery.isLoading,
    isLoading: circlesQuery.isLoading || petsQuery.isLoading,
    isError: circlesQuery.isError || petsQuery.isError,
    refetch: () => {
      void circlesQuery.refetch();
      return petsQuery.refetch();
    },
  };
}

export function usePets() {
  const { pets, circle, loading } = useActivePet();
  return { pets, circle, loading };
}

/* --------------------------------- Today --------------------------------- */

export function useToday(circleId: string | undefined, date?: string) {
  const day = date ?? dayjs().format('YYYY-MM-DD');
  return useQuery({
    queryKey: qk.today(circleId ?? '', day),
    queryFn: async () => {
      const r = await get<TodayResponseDTO>(`/circles/${circleId}/today?date=${day}`);
      const groups: TodayPetGroup[] = (r.pets ?? []).map((g: TodayPetGroupDTO) => ({
        pet_id: g.pet_id,
        pet_name: g.pet_name,
        tasks: (g.items ?? []).map((it) => ({
          id: it.task.id,
          pet_id: it.task.pet_id,
          title: it.task.title,
          time_of_day: it.task.time_of_day ?? '',
          schedule: it.task.schedule,
          log: normalizeLog(it.log),
        })),
      }));
      return { date: r.date, groups } satisfies TodayResponse;
    },
    enabled: !!circleId,
  });
}

/* ---------------------------- 任务完成 / Undo ---------------------------- */

type TodayCache = TodayResponse | undefined;

function patchTodayTask(
  client: ReturnType<typeof useQueryClient>,
  circleId: string,
  date: string,
  taskId: string,
  log: TaskLog | null,
): void {
  client.setQueryData<TodayResponse>(qk.today(circleId, date), (prev) => {
    if (!prev) return prev;
    return {
      ...prev,
      groups: prev.groups.map((g) => ({
        ...g,
        tasks: g.tasks.map((t) => (t.id === taskId ? { ...t, log } : t)),
      })),
    };
  });
}

/**
 * POST /tasks/{id}/logs — done/skipped 共用。
 * 409 TASK_LOG_EXISTS：采用服务端权威 log，静默成功（契约 §今日任务）。
 */
function useTaskLogMutation(
  circleId: string | undefined,
  date: string,
  status: 'done' | 'skipped',
): UseMutationResult<
  { log: TaskLog } | void,
  ApiError,
  { taskId: string; note?: string; date?: string },
  { day: string; previous: TodayCache } | undefined
> {
  const client = useQueryClient();
  return useMutation<
    { log: TaskLog } | void,
    ApiError,
    { taskId: string; note?: string; date?: string },
    { day: string; previous: TodayCache } | undefined
  >({
    mutationFn: async (vars) => {
      try {
        const r = await post<{ log: TaskLogDTO }>(`/tasks/${vars.taskId}/logs`, {
          status,
          note: vars.note,
          date: vars.date ?? date,
        });
        return { log: normalizeLog(r.log)! };
      } catch (err) {
        if (err instanceof ApiError && err.code === 'TASK_LOG_EXISTS') {
          const authoritative = err.authoritativeLog as TaskLogDTO | null;
          if (authoritative) return { log: normalizeLog(authoritative)! }; // 采用，不报错
        }
        throw err;
      }
    },
    onMutate: async (vars) => {
      if (!circleId) return undefined;
      const day = vars.date ?? date;
      await client.cancelQueries({ queryKey: qk.today(circleId, day) });
      const previous = client.getQueryData<TodayResponse>(qk.today(circleId, day));
      patchTodayTask(client, circleId, day, vars.taskId, {
        status,
        by_name: '我',
        at: new Date().toISOString(),
        note: vars.note,
      });
      return { day, previous };
    },
    onError: (_err, _vars, ctx) => {
      if (circleId && ctx) client.setQueryData(qk.today(circleId, ctx.day), ctx.previous);
    },
    onSettled: (_d, _e, vars, ctx) => {
      if (!circleId) return;
      const day = ctx?.day ?? vars?.date ?? date;
      void client.invalidateQueries({ queryKey: qk.today(circleId, day) });
    },
  });
}

export function useCompleteTask(circleId: string | undefined, date?: string) {
  const day = date ?? dayjs().format('YYYY-MM-DD');
  return useTaskLogMutation(circleId, day, 'done');
}

export function useSkipTask(circleId: string | undefined, date?: string) {
  const day = date ?? dayjs().format('YYYY-MM-DD');
  return useTaskLogMutation(circleId, day, 'skipped');
}

/** POST /task-logs/{id}/undo — 乐观置空 log。 */
export function useUndoTask(circleId: string | undefined, date?: string) {
  const client = useQueryClient();
  const day = date ?? dayjs().format('YYYY-MM-DD');
  return useMutation<unknown, ApiError, { logId: string; taskId: string; date?: string }>({
    mutationFn: (vars) => post(`/task-logs/${vars.logId}/undo`),
    onMutate: async (vars) => {
      if (!circleId) return;
      const d = vars.date ?? day;
      await client.cancelQueries({ queryKey: qk.today(circleId, d) });
      patchTodayTask(client, circleId, d, vars.taskId, null);
    },
    onError: () => {
      if (circleId) void client.invalidateQueries({ queryKey: qk.today(circleId, day) });
    },
    onSettled: () => {
      if (circleId) void client.invalidateQueries({ queryKey: qk.today(circleId, day) });
    },
  });
}

/** 兼容旧名（个别屏幕在用）。 */
export const useUndoLog = useUndoTask;

/* -------------------------------- Timeline -------------------------------- */

export function useTimeline(petId: string | undefined) {
  return useInfiniteQuery({
    queryKey: qk.timeline(petId ?? ''),
    queryFn: async ({ pageParam }) => {
      const before = pageParam ? `&before=${encodeURIComponent(pageParam)}` : '';
      const r = await get<{ events: Parameters<typeof normalizeEvent>[0][] }>(
        `/pets/${petId}/timeline?limit=${TIMELINE_PAGE_SIZE}${before}`,
      );
      const events = (r.events ?? []).map(normalizeEvent);
      const oldest = events.length > 0 ? events[events.length - 1].occurred_at : null;
      return {
        events,
        next_cursor: oldest && events.length >= TIMELINE_PAGE_SIZE ? oldest : null,
      } satisfies TimelinePage;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last: TimelinePage) => last.next_cursor ?? undefined,
    enabled: !!petId,
  });
}

export interface CreateEventInput {
  type: TimelineEventType;
  title?: string;
  body?: string;
  occurred_at?: string;
  severity?: string;
  /** 直接传 payload（优先级高于 title/body 组装） */
  payload?: Record<string, unknown>;
  /** 兼容字段（旧屏）：并入 payload */
  data?: Record<string, unknown>;
}

/** 屏幕输入 → 各类型 payload（服务端按类型校验）。 */
function buildPayload(input: CreateEventInput): Record<string, unknown> {
  // 旧枚举映射：UI 用 'visit'，契约是 'vet_visit'
  const type = input.type === 'visit' ? 'vet_visit' : input.type;
  if (input.payload) return { ...input.data, ...input.payload };
  const p: Record<string, unknown> = { ...input.data };
  switch (type) {
    case 'symptom':
      if (input.title) p.title = input.title;
      if (input.body) p.detail = input.body;
      if (input.severity) p.severity = input.severity;
      break;
    case 'note':
      if (input.body ?? input.title) p.text = input.body ?? input.title;
      break;
    case 'vaccine':
      if (input.title) p.name = input.title;
      if (input.body) p.due = input.body;
      break;
    case 'vet_visit':
      if (input.title) p.title = input.title;
      if (input.body) p.summary = input.body;
      break;
    case 'weight':
      if (input.body) p.weight_g = Math.round(parseFloat(input.body) * 1000);
      break;
    default:
      if (input.title) p.title = input.title;
      if (input.body) p.text = input.body;
  }
  return p;
}

/** PATCH /timeline-events/{id}（本人或 owner；auto 事件服务端拒绝）。 */
export function useUpdateEvent(petId: string | undefined) {
  const client = useQueryClient();
  return useMutation<
    TimelineEvent,
    ApiError,
    { eventId: string; input: CreateEventInput }
  >({
    mutationFn: ({ eventId, input }) =>
      patch<{ event: Parameters<typeof normalizeEvent>[0] }>(`/timeline-events/${eventId}`, {
        occurred_at: input.occurred_at ?? new Date().toISOString(),
        payload: buildPayload(input),
      }).then((r) => normalizeEvent(r.event)),
    onSettled: () => {
      if (petId) void client.invalidateQueries({ queryKey: qk.timeline(petId) });
    },
  });
}

/* --------------------------------- Tasks --------------------------------- */

export interface ScheduleInput {
  kind: 'daily' | 'weekly' | 'interval';
  days?: number[]; // ISO 1..7
  every_n?: number;
}

export interface CreateTaskInput {
  title: string;
  time_of_day?: string; // HH:MM
  schedule?: ScheduleInput; // 缺省 daily
}

/** POST /pets/{id}/tasks（排程语法 v1）。 */
export function useCreateTask(circleId: string | undefined, date?: string) {
  const client = useQueryClient();
  const day = date ?? dayjs().format('YYYY-MM-DD');
  return useMutation<unknown, ApiError, CreateTaskInput & { petId: string }>({
    mutationFn: ({ petId, title, time_of_day, schedule }) =>
      post(`/pets/${petId}/tasks`, {
        title,
        time_of_day,
        schedule: schedule
          ? {
              v: 1,
              kind: schedule.kind,
              ...(schedule.kind === 'weekly' ? { days: schedule.days ?? [1] } : {}),
              ...(schedule.kind === 'interval' ? { every_n: schedule.every_n ?? 1 } : {}),
            }
          : { v: 1, kind: 'daily' },
      }),
    onSettled: () => {
      if (circleId) {
        void client.invalidateQueries({ queryKey: qk.today(circleId, day) });
        void client.invalidateQueries({ queryKey: ['circle', circleId] });
      }
    },
  });
}

export function useUpdateTask(circleId: string | undefined, date?: string) {
  const client = useQueryClient();
  const day = date ?? dayjs().format('YYYY-MM-DD');
  return useMutation<
    unknown,
    ApiError,
    { taskId: string; title?: string; time_of_day?: string | null; archived?: boolean }
  >({
    mutationFn: ({ taskId, ...body }) => patch(`/tasks/${taskId}`, body),
    onSettled: () => {
      if (circleId) void client.invalidateQueries({ queryKey: qk.today(circleId, day) });
    },
  });
}

export function useDeleteTask(circleId: string | undefined, date?: string) {
  const client = useQueryClient();
  const day = date ?? dayjs().format('YYYY-MM-DD');
  return useMutation<unknown, ApiError, string>({
    mutationFn: (taskId) => del(`/tasks/${taskId}`),
    onSettled: () => {
      if (circleId) void client.invalidateQueries({ queryKey: qk.today(circleId, day) });
    },
  });
}

/* ---------------------------------- Pet ---------------------------------- */

export function usePet(petId: string | undefined) {
  return useQuery({
    queryKey: qk.pet(petId ?? ''),
    queryFn: () =>
      get<PetWithProfileDTO>(`/pets/${petId}`).then((r) => mergePet(r.pet, r.profile)),
    enabled: !!petId,
  });
}

export function useUpdatePet(petId: string | undefined) {
  const client = useQueryClient();
  return useMutation<
    Pet,
    ApiError,
    { name?: string; species?: string; breed?: string; birth_date?: string | null; sex?: string; neutered?: boolean; version: number }
  >({
    mutationFn: (body) => patch<{ pet: PetDTO }>(`/pets/${petId}`, body).then((r) => r.pet as Pet),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: qk.pet(petId ?? '') });
      void client.invalidateQueries({ queryKey: qk.circles });
    },
  });
}

/** PATCH /pets/{id}/profile —— allergies/conditions 字符串数组回写为对象数组。 */
export function useUpdateProfile(petId: string | undefined) {
  const client = useQueryClient();
  return useMutation<
    unknown,
    ApiError,
    {
      allergies?: string[];
      conditions?: string[];
      emergency_contacts?: { name: string; phone?: string; relation?: string }[];
      med_decision_maker?: { name: string; phone?: string } | null;
      notes?: string;
    }
  >({
    mutationFn: (body) =>
      patch(`/pets/${petId}/profile`, {
        allergies: body.allergies?.map((name) => ({ name })),
        conditions: body.conditions?.map((name) => ({ name })),
        emergency_contacts: body.emergency_contacts,
        med_decision_maker: body.med_decision_maker,
        notes: body.notes,
      }),
    onSettled: () => void client.invalidateQueries({ queryKey: qk.pet(petId ?? '') }),
  });
}

/** POST /pets/{id}/archive|unarchive（纪念态）。 */
export function useArchivePet() {
  const client = useQueryClient();
  return useMutation<Pet, ApiError, { petId: string; archived: boolean }>({
    mutationFn: ({ petId, archived }) =>
      (archived
        ? post<{ pet: PetDTO }>(`/pets/${petId}/archive`)
        : post<{ pet: PetDTO }>(`/pets/${petId}/unarchive`)
      ).then((r) => r.pet as unknown as Pet),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: qk.circles });
    },
  });
}

/** DELETE /pets/{id} —— confirm = pet_id 由本层填入（owner 硬删）。 */
export function useDeletePet() {
  const client = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (petId) => del(`/pets/${petId}`, { body: { confirm: petId } }),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: qk.circles });
    },
  });
}

/* ------------------------------ Medications ------------------------------ */

export function useMedications(petId: string | undefined) {
  return useQuery({
    queryKey: qk.medications(petId ?? ''),
    queryFn: async () => {
      const r = await get<{ medications: MedicationDTO[] }>(`/pets/${petId}/medications`);
      const all = (r.medications ?? []).map(normalizeMedication);
      return { active: all.filter((m) => m.active), past: all.filter((m) => !m.active) };
    },
    enabled: !!petId,
  });
}

export function useCreateMedication(petId: string | undefined) {
  const client = useQueryClient();
  return useMutation<unknown, ApiError, { name: string; dose?: string; schedule?: string; note?: string }>({
    mutationFn: (body) => post(`/pets/${petId}/medications`, body),
    onSettled: () => {
      if (petId) {
        void client.invalidateQueries({ queryKey: qk.medications(petId) });
        void client.invalidateQueries({ queryKey: qk.timeline(petId) });
      }
    },
  });
}

/** 停药（服务端自动写 ended 事件）。 */
export function useStopMedication(petId: string | undefined) {
  const client = useQueryClient();
  return useMutation<unknown, ApiError, { medId: string; ended_on?: string }>({
    mutationFn: ({ medId, ended_on }) => post(`/medications/${medId}/stop`, { ended_on }),
    onSettled: () => {
      if (petId) {
        void client.invalidateQueries({ queryKey: qk.medications(petId) });
        void client.invalidateQueries({ queryKey: qk.timeline(petId) });
      }
    },
  });
}

export function useDeleteMedication(petId: string | undefined) {
  const client = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (medId) => del(`/medications/${medId}`),
    onSettled: () => {
      if (petId) {
        void client.invalidateQueries({ queryKey: qk.medications(petId) });
        void client.invalidateQueries({ queryKey: qk.timeline(petId) });
      }
    },
  });
}

/* --------------------------------- Shares --------------------------------- */

export function useShares(petId: string | undefined) {
  return useQuery({
    queryKey: qk.shares(petId ?? ''),
    queryFn: async () => {
      const r = await get<{ shares: ShareDTO[] }>(`/pets/${petId}/shares`);
      return (r.shares ?? []).map(normalizeShare);
    },
    enabled: !!petId,
  });
}

export interface CreateShareInput {
  kind: 'care_card' | 'summary';
  ttl_hours: 24 | 72 | 168;
  options?: { sections?: string[]; days?: number };
}

/** POST /pets/{id}/shares —— 返回一次性 token 与查看地址。 */
export function useCreateShare(petId: string | undefined) {
  const client = useQueryClient();
  return useMutation<ShareRecord, ApiError, CreateShareInput>({
    mutationFn: async (input) => {
      const { shareURL } = await import('./api');
      const r = await post<{ share: ShareDTO; token: string }>(`/pets/${petId}/shares`, input);
      return { share: normalizeShare(r.share), token: r.token, url: shareURL(r.token) };
    },
    onSettled: () => {
      if (petId) void client.invalidateQueries({ queryKey: qk.shares(petId) });
    },
  });
}

export function useRevokeShare(petId: string | undefined) {
  const client = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (shareId) => del(`/shares/${shareId}`),
    onSettled: () => {
      if (petId) void client.invalidateQueries({ queryKey: qk.shares(petId) });
    },
  });
}

/* ------------------------------ 家庭治理/成员 ------------------------------ */

/** POST /circles —— onboarding 第一步；返回一次性邀请码。 */
export function useCreateCircle() {
  const client = useQueryClient();
  return useMutation<{ circle: Circle; invite_code: string }, ApiError, { name: string; timezone?: string }>({
    mutationFn: (body) => post(`/circles`, body),
    onSettled: () => void client.invalidateQueries({ queryKey: qk.circles }),
  });
}

/** POST /circles/{id}/pets —— onboarding 第二步 / 添加宠物。 */
export function useCreatePet(circleId: string | undefined) {
  const client = useQueryClient();
  return useMutation<
    PetSummary,
    ApiError,
    { name: string; species: string; breed?: string; birth_date?: string | null; sex?: string; neutered?: boolean; weight_g?: number }
  >({
    mutationFn: (body) =>
      post<{ pet: PetDTO }>(`/circles/${circleId}/pets`, body).then((r) => r.pet),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: qk.circles });
      if (circleId) void client.invalidateQueries({ queryKey: qk.circlePets(circleId) });
    },
  });
}

/** POST /circles/join —— 邀请码加入。 */
export function useJoinCircle() {
  const client = useQueryClient();
  return useMutation<Circle, ApiError, { code: string }>({
    mutationFn: (body) => post<{ circle: CircleDTO }>('/circles/join', body).then((r) => r.circle),
    onSettled: () => void client.invalidateQueries({ queryKey: qk.circles }),
  });
}

/** POST /circles/{id}/invite/refresh —— 滚动刷新（旧码即失效）。 */
export function useInviteRefresh(circleId: string | undefined) {
  return useMutation<{ invite_code: string }, ApiError, void>({
    mutationFn: () => post(`/circles/${circleId}/invite/refresh`),
  });
}

export function useRemoveMember(circleId: string | undefined) {
  const client = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (userId) => del(`/circles/${circleId}/members/${userId}`),
    onSettled: () => {
      if (circleId) void client.invalidateQueries({ queryKey: qk.circle(circleId) });
      void client.invalidateQueries({ queryKey: qk.usage(circleId ?? '') });
    },
  });
}

export function useLeaveCircle() {
  const client = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (circleId) => post(`/circles/${circleId}/leave`),
    onSettled: () => void client.invalidateQueries({ queryKey: qk.circles }),
  });
}

/** 所有权移交（发起者降为 caregiver）。 */
export function useTransferOwnership(circleId: string | undefined) {
  const client = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (toUserId) =>
      post(`/circles/${circleId}/transfer`, { to_user_id: toUserId }),
    onSettled: () => {
      if (circleId) void client.invalidateQueries({ queryKey: qk.circle(circleId) });
      void client.invalidateQueries({ queryKey: qk.circles });
    },
  });
}

/** 删家庭（服务端要求已清空；FAMILY_NOT_EMPTY 引导清空）。 */
export function useDeleteCircle() {
  const client = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (circleId) => del(`/circles/${circleId}`),
    onSettled: () => void client.invalidateQueries({ queryKey: qk.circles }),
  });
}

export function useRestoreCircle() {
  const client = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (circleId) => post(`/circles/${circleId}/restore`),
    onSettled: () => void client.invalidateQueries({ queryKey: qk.circles }),
  });
}

/* ------------------------------- 宠物转移 ------------------------------- */

/** POST /pets/{id}/transfer（源圈 owner 发起）。 */
export function useCreatePetTransfer() {
  const client = useQueryClient();
  return useMutation<PetTransferDTO, ApiError, { petId: string; to_circle_id: string }>({
    mutationFn: ({ petId, to_circle_id }) =>
      post<{ transfer: PetTransferDTO }>(`/pets/${petId}/transfer`, { to_circle_id }).then(
        (r) => r.transfer,
      ),
    onSettled: () => void client.invalidateQueries({ queryKey: qk.circles }),
  });
}

export function useCircleTransfers(circleId: string | undefined, direction: 'incoming' | 'outgoing' = 'incoming') {
  return useQuery({
    queryKey: qk.transfers(circleId ?? '', direction),
    queryFn: () =>
      get<{ transfers: PetTransferDTO[] }>(
        `/circles/${circleId}/transfers?direction=${direction}`,
      ).then((r) => r.transfers ?? []),
    enabled: !!circleId,
  });
}

/** 接受转移 —— 归属翻转：双方圈/宠的全部缓存失效。 */
export function useAcceptTransfer() {
  const client = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (transferId) => post(`/transfers/${transferId}/accept`),
    onSettled: () => void client.invalidateQueries(), // 大换血：全量失效
  });
}

export function useDeclineTransfer() {
  const client = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (transferId) => post(`/transfers/${transferId}/decline`),
    onSettled: () => void client.invalidateQueries({ queryKey: ['circle'] }),
  });
}

export function useCancelTransfer() {
  const client = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (transferId) => del(`/transfers/${transferId}`),
    onSettled: () => void client.invalidateQueries({ queryKey: ['circle'] }),
  });
}

/* --------------------------------- 账号 --------------------------------- */

export function useRenameMe() {
  const client = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (displayName) => patch('/me', { display_name: displayName }),
    onSettled: () => void client.invalidateQueries({ queryKey: qk.me }),
  });
}

/** 登出（撤销当前 session）。 */
export function useLogout() {
  return useMutation<unknown, ApiError, void>({
    mutationFn: async () => {
      const { clearToken } = await import('./api');
      await del('/auth/session').catch(() => undefined); // 撤销失败也继续本地登出
      await clearToken();
      queryClient.clear();
    },
  });
}

/** 注销（confirm = 账号邮箱，本层填入）。 */
export function useDeleteAccount(email: string) {
  return useMutation<unknown, ApiError, void>({
    mutationFn: async () => {
      const { clearToken } = await import('./api');
      await del('/account', { body: { confirm: email } });
      await clearToken();
      queryClient.clear();
    },
  });
}
