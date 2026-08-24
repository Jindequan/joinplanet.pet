import { apiClient, request } from '../network/api-client';

export type Role = 'owner' | 'caregiver' | 'editor' | 'viewer' | 'read_only';

export type User = {
  id: string;
  email: string;
  display_name: string;
  locale: string;
  timezone?: string;
  created_at: string;
};

export type Entitlement = { key: string; source: string; expires_at?: string | null };
export type Family = { id: string; name: string; timezone: string; role?: Role; created_at: string };
export type DeletedFamily = { id: string; name: string; deleted_at: string };
export type Member = { user_id: string; email?: string; display_name: string; role: Role; joined_at: string };
export type Pet = {
  id: string;
  family_ids?: string[];
  name: string;
  species: 'dog' | 'cat' | 'other';
  breed: string;
  birth_date?: string | null;
  sex: '' | 'male' | 'female';
  neutered: boolean;
  weight_g?: number | null;
  archived_at?: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  current_owner_user_id?: string;
  access_role?: Role;
};
export type Profile = {
  allergies: unknown[];
  conditions: unknown[];
  emergency_contacts: unknown[];
  med_decision_maker?: unknown;
  notes: string;
};
export type Task = { id: string; pet_id: string; care_plan_id?: string; care_rule_id?: string; type?: string; title: string; description?: string; schedule: Record<string, unknown>; time_of_day?: string; timezone: string; due_at?: string; due_date?: string; status?: 'pending' | 'completed' | 'skipped' | 'missed'; assigned_to_user_id?: string; assigned_to_name?: string; completed_by_user_id?: string; completed_at?: string; archived_at?: string | null; created_at: string };
/** A CarePlan projected with its current rule and next executable occurrence. */
export type CarePlanSummary = Task;
export type TaskLog = { id: string; task_id: string; log_date: string; status: 'done' | 'completed' | 'skipped'; done_by: string; done_at: string; note: string; done_by_name?: string };
export type TodayItem = { task: Task; log: TaskLog | null };
export type TodayPet = { pet_id: string; pet_name: string; items: TodayItem[] };
export type Today = { date: string; pets: TodayPet[] };
export type CarePlan = { id: string; pet_id: string; type: 'medication' | 'feeding' | 'health' | 'grooming' | 'exercise' | 'custom'; title: string; description: string; status: 'active' | 'paused' | 'archived'; created_by_user_id?: string; created_at: string; updated_at: string };
export type CareRule = { id: string; care_plan_id: string; frequency: { v: 1; kind: 'daily' | 'weekly' | 'monthly' | 'interval'; days?: number[]; day?: number; every_n?: number }; start_date: string; end_date?: string; time_of_day?: string; timezone: string; created_at: string; updated_at: string };
export type CareAssignment = { care_plan_id: string; user_id: string; user_name: string; role: 'owner' | 'helper'; created_by_user_id?: string; created_at: string };
export type CarePlanCreateResponse = { care_plan: CarePlan; care_rule: CareRule; task?: Task };
export type Medication = { id: string; pet_id: string; name: string; dose: string; schedule: string; started_on: string; ended_on?: string; note: string; created_at: string; updated_at: string };
export type TimelineEvent = { id: string; pet_id: string; type: string; occurred_at: string; recorded_by: string; recorded_by_name?: string; recorded_at: string; edited_at?: string; payload: Record<string, unknown>; payload_version: number; source: string };
export type Share = { id: string; pet_id: string; kind: 'care_card' | 'summary'; expires_at: string; revoked_at?: string | null; view_count: number; last_viewed_at?: string | null; created_at: string };
export type TransferStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';
export type Transfer = { id: string; pet_id: string; pet_name: string; from_family_id: string; to_family_id: string; status: TransferStatus; created_by_user_id?: string; decided_by_user_id?: string; created_at: string; decided_at?: string };
export type Alert = { id: string; kind: string; pet_id: string; pet_name: string; title: string; body: string; severity: 'watch' | 'warn'; occurred_at: string; data?: Record<string, unknown> };
export type NotificationPrefs = { reminders: boolean; digest: boolean; alerts: boolean };
export type Usage = { plan: string; members: number; member_max: number; pets: number; pet_max: number; resources?: Record<string, { used: number; limit: number }> };

export type MeResponse = { user: User; entitlements: Entitlement[] };
export type AuthResponse = { token: string; expires_at: string; user: User; dev_code?: string };
export type FamilyDetailResponse = { family: Family; members: Member[] };
export type PetResponse = { pet: Pet; profile: Profile };
export type ExportResponse = Record<string, unknown> & { pet: Pet; profile: Profile };
export type ShareViewResponse = { kind: Share['kind']; expires_at: string; created_at: string; data: Record<string, unknown> };

const id = encodeURIComponent;
export const createIdempotencyKey = () => `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const planetApi = {
  auth: {
    requestCode: (email: string) => apiClient.post<{ sent: boolean; dev_code?: string }>('/auth/request-code', { email }),
    verifyCode: (email: string, code: string, device?: string) => apiClient.post<AuthResponse>('/auth/verify-code', { email, code, device }),
    logout: () => apiClient.delete<void>('/auth/session'),
  },
  me: {
    get: () => apiClient.get<MeResponse>('/me'),
    update: (display_name: string) => apiClient.patch<MeResponse>('/me', { display_name }),
    usage: () => apiClient.get<Usage>('/me/usage'),
    deleteAccount: (confirm: string) => request<void>('/account', { method: 'DELETE', body: { confirm } }),
  },
  families: {
    list: () => apiClient.get<{ families: Family[] }>('/families'),
    deleted: () => apiClient.get<{ families: DeletedFamily[] }>('/families/deleted'),
    detail: (familyId: string) => apiClient.get<FamilyDetailResponse>(`/families/${id(familyId)}`),
    create: (name: string, timezone?: string, requestKey = createIdempotencyKey()) => apiClient.post<{ family: Family; invite_code: string }>('/families', { name, timezone }, { headers: { 'Idempotency-Key': requestKey } }),
    update: (familyId: string, body: { name?: string; timezone?: string }) => apiClient.patch<{ family: Family }>(`/families/${id(familyId)}`, body),
    refreshInvite: (familyId: string) => apiClient.post<{ invite_code: string }>(`/families/${id(familyId)}/invite/refresh`),
    join: (code: string) => apiClient.post<{ family: Family }>('/families/join', { code }),
    removeMember: (familyId: string, userId: string) => apiClient.delete<void>(`/families/${id(familyId)}/members/${id(userId)}`),
    leave: (familyId: string) => apiClient.post<void>(`/families/${id(familyId)}/leave`),
    usage: (familyId: string) => apiClient.get<Usage>(`/families/${id(familyId)}/usage`),
    transfer: (familyId: string, to_user_id: string, requestKey = createIdempotencyKey()) => apiClient.post<FamilyDetailResponse>(`/families/${id(familyId)}/transfer`, { to_user_id }, { headers: { 'Idempotency-Key': requestKey } }),
    delete: (familyId: string, confirm: string) => request<void>(`/families/${id(familyId)}`, { method: 'DELETE', body: { confirm } }),
    restore: (familyId: string) => apiClient.post<{ family: Family }>(`/families/${id(familyId)}/restore`),
    invitePreview: (code: string) => apiClient.get<{ family: Family }>(`/invite/${id(code)}`),
    pets: (familyId: string) => apiClient.get<{ pets: Pet[] }>(`/families/${id(familyId)}/pets`),
    today: (familyId: string, date?: string) => apiClient.get<Today>(`/families/${id(familyId)}/today${date ? `?date=${encodeURIComponent(date)}` : ''}`),
    alerts: (familyId: string) => apiClient.get<{ alerts: Alert[] }>(`/families/${id(familyId)}/alerts`),
    digest: (familyId: string, date?: string) => apiClient.get<Record<string, unknown>>(`/families/${id(familyId)}/digest${date ? `?date=${encodeURIComponent(date)}` : ''}`),
    sendDigest: (familyId: string, date?: string) => apiClient.post<Record<string, unknown>>(`/families/${id(familyId)}/digest/send`, date ? { date } : {}),
    notificationPrefs: (familyId: string) => apiClient.get<{ prefs: NotificationPrefs }>(`/families/${id(familyId)}/notification-prefs`),
    updateNotificationPrefs: (familyId: string, body: Partial<NotificationPrefs>) => apiClient.put<{ prefs: NotificationPrefs }>(`/families/${id(familyId)}/notification-prefs`, body),
  },
  pets: {
    listAccessible: () => apiClient.get<{ pets: Pet[] }>('/pets'),
    create: (familyId: string, body: { name: string; species: Pet['species']; breed?: string; birth_date?: string; sex?: Pet['sex']; neutered?: boolean; weight_g?: number }, requestKey = createIdempotencyKey()) => apiClient.post<{ pet: Pet }>(`/families/${id(familyId)}/pets`, body, { headers: { 'Idempotency-Key': requestKey } }),
    list: (familyId: string) => planetApi.families.pets(familyId),
    get: (petId: string) => apiClient.get<PetResponse>(`/pets/${id(petId)}`),
    today: (petId: string, date?: string) => apiClient.get<Today>(`/today?pet_id=${id(petId)}${date ? `&date=${encodeURIComponent(date)}` : ''}`),
    export: (petId: string) => apiClient.get<ExportResponse>(`/pets/${id(petId)}/export`),
    update: (petId: string, body: Record<string, unknown>) => apiClient.patch<{ pet: Pet }>(`/pets/${id(petId)}`, body),
    updateRecord: (petId: string, body: Record<string, unknown>, requestKey = createIdempotencyKey()) => apiClient.patch<{ pet: Pet; profile: Profile }>(`/pets/${id(petId)}/record`, body, { headers: { 'Idempotency-Key': requestKey } }),
    delete: (petId: string) => request<void>(`/pets/${id(petId)}`, { method: 'DELETE', body: { confirm: petId } }),
    updateProfile: (petId: string, body: Partial<Profile>) => apiClient.patch<{ profile: Profile }>(`/pets/${id(petId)}/profile`, body),
    archive: (petId: string) => apiClient.post<{ pet: Pet }>(`/pets/${id(petId)}/archive`),
    unarchive: (petId: string) => apiClient.post<{ pet: Pet }>(`/pets/${id(petId)}/unarchive`),
    shareFamily: (petId: string, family_id: string) => apiClient.post<{ ok: boolean; family_id: string }>(`/pets/${id(petId)}/families`, { family_id }),
    unshareFamily: (petId: string, familyId: string) => apiClient.delete<void>(`/pets/${id(petId)}/families/${id(familyId)}`),
    accessGrants: (petId: string) => apiClient.get<{ grants: Record<string, unknown>[] }>(`/pets/${id(petId)}/access-grants`),
    grantAccess: (petId: string, body: { user_id: string; role: Role; expires_at?: string }) => apiClient.post<{ grant: Record<string, unknown> }>(`/pets/${id(petId)}/access-grants`, body),
    revokeAccess: (petId: string, grantId: string) => apiClient.delete<void>(`/pets/${id(petId)}/access-grants/${id(grantId)}`),
    medications: (petId: string) => apiClient.get<{ medications: Medication[] }>(`/pets/${id(petId)}/medications`),
    createMedication: (petId: string, body: { name: string; dose?: string; schedule?: string; note?: string }, requestKey = createIdempotencyKey()) => apiClient.post<{ medication: Medication }>(`/pets/${id(petId)}/medications`, body, { headers: { 'Idempotency-Key': requestKey } }),
    carePlans: (petId: string, includeArchived = false) => apiClient.get<{ care_plans: CarePlanSummary[] }>(`/pets/${id(petId)}/care-plans${includeArchived ? '?include_archived=true' : ''}`),
    createCarePlan: (petId: string, body: { type: CarePlan['type']; title: string; description?: string; rule: { type: 'daily' | 'weekly' | 'monthly' | 'interval'; interval?: number; days?: number[]; day?: number; time?: string; start_date?: string; end_date?: string } }, requestKey = createIdempotencyKey()) => apiClient.post<CarePlanCreateResponse>(`/pets/${id(petId)}/care-plans`, body, { headers: { 'Idempotency-Key': requestKey } }),
    timeline: (petId: string, params?: { before?: string; before_id?: string; limit?: number }) => {
      const query = new URLSearchParams();
      if (params?.before) query.set('before', params.before);
      if (params?.before_id) query.set('before_id', params.before_id);
      if (params?.limit) query.set('limit', String(params.limit));
      const suffix = query.toString() ? `?${query.toString()}` : '';
      return apiClient.get<{ events: TimelineEvent[]; next_cursor?: { before: string; before_id: string } }>(`/pets/${id(petId)}/timeline${suffix}`);
    },
    createEvent: (petId: string, body: { type: string; occurred_at: string; payload: Record<string, unknown> }, requestKey = createIdempotencyKey()) => apiClient.post<{ event: TimelineEvent }>(`/pets/${id(petId)}/timeline`, body, { headers: { 'Idempotency-Key': requestKey } }),
    shares: (petId: string) => apiClient.get<{ shares: Share[] }>(`/pets/${id(petId)}/shares`),
    createShare: (petId: string, body: { kind: Share['kind']; ttl_hours: 24 | 72 | 168; options?: Record<string, unknown> }, requestKey = createIdempotencyKey()) => apiClient.post<{ share: Share; token: string }>(`/pets/${id(petId)}/shares`, body, { headers: { 'Idempotency-Key': requestKey } }),
    transfer: (petId: string, to_family_id: string, requestKey = createIdempotencyKey()) => apiClient.post<{ transfer: Transfer }>(`/pets/${id(petId)}/transfer`, { to_family_id }, { headers: { 'Idempotency-Key': requestKey } }),
  },
  medications: {
    update: (medicationId: string, body: Partial<Pick<Medication, 'name' | 'dose' | 'schedule' | 'note'>>) => apiClient.patch<{ medication: Medication }>(`/medications/${id(medicationId)}`, body),
    stop: (medicationId: string, ended_on?: string) => apiClient.post<{ medication: Medication }>(`/medications/${id(medicationId)}/stop`, ended_on ? { ended_on } : {}),
    delete: (medicationId: string) => apiClient.delete<void>(`/medications/${id(medicationId)}`),
  },
  tasks: {
    complete: (taskId: string, body: { status: 'done' | 'skipped'; date?: string; note?: string }, requestKey = createIdempotencyKey()) => apiClient.post<{ log: TaskLog }>(`/care-tasks/${id(taskId)}/complete`, body, { headers: { 'Idempotency-Key': requestKey } }),
    undo: (logId: string) => apiClient.post<void>(`/task-logs/${id(logId)}/undo`),
  },
  carePlans: {
    update: (carePlanId: string, body: { title?: string; description?: string; schedule?: Record<string, unknown>; time_of_day?: string; archived?: boolean }) => apiClient.patch<{ care_plan: CarePlanSummary }>(`/care-plans/${id(carePlanId)}`, body),
    delete: (carePlanId: string) => apiClient.delete<void>(`/care-plans/${id(carePlanId)}`),
    assignments: (carePlanId: string) => apiClient.get<{ assignments: CareAssignment[] }>(`/care-plans/${id(carePlanId)}/assignments`),
    setAssignment: (carePlanId: string, userId: string, role: 'helper' = 'helper') => apiClient.put<{ assignment: CareAssignment }>(`/care-plans/${id(carePlanId)}/assignments/${id(userId)}`, { role }),
    removeAssignment: (carePlanId: string, userId: string) => apiClient.delete<void>(`/care-plans/${id(carePlanId)}/assignments/${id(userId)}`),
  },
  timeline: {
    update: (eventId: string, body: { occurred_at: string; payload: Record<string, unknown> }) => apiClient.patch<{ event: TimelineEvent }>(`/timeline-events/${id(eventId)}`, body),
    delete: (eventId: string) => apiClient.delete<void>(`/timeline-events/${id(eventId)}`),
  },
  transfers: {
    list: (familyId: string, direction?: 'incoming' | 'outgoing') => apiClient.get<{ transfers: Transfer[] }>(`/families/${id(familyId)}/transfers${direction ? `?direction=${direction}` : ''}`),
    accept: (transferId: string, requestKey = createIdempotencyKey()) => apiClient.post<{ transfer: Transfer }>(`/transfers/${id(transferId)}/accept`, undefined, { headers: { 'Idempotency-Key': requestKey } }),
    decline: (transferId: string, requestKey = createIdempotencyKey()) => apiClient.post<{ transfer: Transfer }>(`/transfers/${id(transferId)}/decline`, undefined, { headers: { 'Idempotency-Key': requestKey } }),
    cancel: (transferId: string, requestKey = createIdempotencyKey()) => apiClient.delete<void>(`/transfers/${id(transferId)}`, { headers: { 'Idempotency-Key': requestKey } }),
  },
  shares: {
    revoke: (shareId: string) => apiClient.delete<void>(`/shares/${id(shareId)}`),
    view: (token: string) => request<ShareViewResponse>(`/shares/${id(token)}`, { method: 'GET' }),
  },
  notifications: {
    registerPushToken: (token: string, platform: string) => apiClient.post<{ push_token: Record<string, unknown> }>('/me/push-tokens', { token, platform }),
    deletePushToken: (token: string) => request<void>('/me/push-tokens', { method: 'DELETE', body: { token } }),
  },
};
