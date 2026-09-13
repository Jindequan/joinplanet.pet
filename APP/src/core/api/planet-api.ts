import { apiClient, request } from '../network/api-client';

export type Role = 'owner' | 'caregiver' | 'editor' | 'viewer' | 'read_only';
export type FamilyMemberRole = 'caregiver' | 'viewer';

export type User = {
  id: string;
  email: string;
  display_name: string;
  locale: string;
  timezone?: string;
  created_at: string;
};

export type Entitlement = { key: string; source: string; expires_at?: string | null };
export type Family = {
  id: string
  name: string
  timezone: string
  role?: Role
  member_count?: number
  pet_count?: number
  created_at: string
};
export type DeletedFamily = { id: string; name: string; deleted_at: string };
export type Member = { user_id: string; email?: string; display_name: string; role: Role; joined_at: string };
export type Pet = {
  id: string;
  family_ids?: string[];
  family_roles?: Partial<Record<string, Role>>;
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
export type Task = { id: string; pet_id: string; family_id?: string; care_plan_id?: string; care_rule_id?: string; type?: string; title: string; description?: string; schedule: Record<string, unknown>; time_of_day?: string; timezone: string; due_at?: string; due_date?: string; status?: 'pending' | 'completed' | 'skipped' | 'missed'; assigned_to_user_id?: string; assigned_to_name?: string; completed_by_user_id?: string; completed_at?: string; archived_at?: string | null; created_at: string };
/** A CarePlan projected with its current rule and next executable occurrence. */
export type CarePlanSummary = Task;
export type TaskLog = { id: string; task_id: string; log_date: string; status: 'done' | 'completed' | 'skipped'; done_by: string; done_at: string; note: string; done_by_name?: string };
export type TodayCareRequestSummary = {
  id: string;
  state: CareRequestState;
  from_user_id: string;
  from_user_name: string;
  target_user_id: string;
  target_user_name: string;
  next_target_user_id?: string;
  next_target_user_name?: string;
  updated_at: string;
};
export type TodayItem = { task: Task; log: TaskLog | null; care_request?: TodayCareRequestSummary | null };
export type TodayPet = { pet_id: string; pet_name: string; items: TodayItem[] };
export type Today = { date: string; pets: TodayPet[] };
export type CarePlan = { id: string; pet_id: string; type: 'medication' | 'feeding' | 'health' | 'grooming' | 'exercise' | 'custom'; title: string; description: string; status: 'active' | 'paused' | 'archived'; created_by_user_id?: string; created_at: string; updated_at: string };
export type CareRule = { id: string; care_plan_id: string; frequency: { v: 1; kind: 'daily' | 'weekly' | 'monthly' | 'interval' | 'once'; days?: number[]; day?: number; every_n?: number; date?: string }; start_date: string; end_date?: string; time_of_day?: string; timezone: string; created_at: string; updated_at: string };
export type ScheduleOverride = {
  id: string;
  care_rule_id: string;
  pet_id: string;
  slot_date: string;
  kind: 'skip' | 'move' | 'replace';
  due_at?: string;
  replacement_plan_id?: string;
  note: string;
  created_by_user_id: string;
  created_at: string;
};
export type ScheduleActionScope = 'this' | 'from_date' | 'rule';
export type ScheduleAction =
  | 'skip'
  | 'move'
  | 'add'
  | 'substitute'
  | 'change_rule';
export type ScheduleActionRequest = {
  action: ScheduleAction;
  scope: ScheduleActionScope;
  slot?: {
    care_rule_id?: string;
    care_plan_id?: string;
    date?: string;
  };
  payload?: Record<string, unknown>;
};
export type ScheduleActionResponse = {
  override?: ScheduleOverride;
  task?: Task;
  care_rule?: CareRule;
};
export type CareAssignment = { care_plan_id: string; user_id: string; user_name: string; role: 'owner' | 'helper'; priority: number; created_by_user_id?: string; created_at: string };
export type CarePlanCreateResponse = { care_plan: CarePlan; care_rule: CareRule; task?: Task };
export type Medication = { id: string; pet_id: string; name: string; dose: string; schedule: string; started_on: string; ended_on?: string; note: string; created_at: string; updated_at: string };
export type TimelineEvent = { id: string; pet_id: string; family_id?: string; care_occurrence_id?: string; type: string; occurred_at: string; recorded_by: string; recorded_by_name?: string; recorded_at: string; edited_at?: string; payload: Record<string, unknown>; payload_version: number; source: string };
export type Share = { id: string; pet_id: string; kind: 'care_card' | 'summary'; expires_at: string; revoked_at?: string | null; view_count: number; last_viewed_at?: string | null; created_at: string };
export type SessionInfo = {
  id: string;
  device_label: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  is_current: boolean;
};
export type AccessGrant = { id: string; pet_id: string; user_id: string; role: Role; expires_at?: string | null; created_at: string };
export type TransferStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';
export type Transfer = { id: string; pet_id: string; pet_name: string; from_family_id: string; to_family_id: string; status: TransferStatus; created_by_user_id?: string; decided_by_user_id?: string; created_at: string; decided_at?: string };
export type Alert = { id: string; kind: string; pet_id: string; pet_name: string; title: string; body: string; severity: 'watch' | 'warn'; occurred_at: string; data?: Record<string, unknown> };
export type CareRisk = {
  occurrence_id: string;
  request_id?: string;
  pet_id: string;
  pet_name: string;
  title: string;
  due_at: string;
  family_timezone?: string;
  waiting_on_user: boolean;
  escalation_failed: boolean;
  can_claim: boolean;
};
export type CareClaim = {
  occurrence_id: string;
  pet_id: string;
  title: string;
  assigned_to_user_id: string;
  assigned_to_name: string;
};
export type NotificationPrefs = { reminders: boolean; digest: boolean; alerts: boolean };
export type Usage = { plan: string; members: number; member_max: number; pets: number; pet_max: number; resources?: Record<string, { used: number; limit: number }> };
export type CareStats = {
  total: number;
  completed: number;
  skipped: number;
  missed: number;
  handled: number;
  rate: number | null;
  per_pet: Array<{
    pet_id: string;
    pet_name: string;
    total: number;
    completed: number;
    skipped: number;
    missed: number;
    handled: number;
    rate: number | null;
  }>;
};
export type DeletedPet = { id: string; name: string; deleted_at: string };
export type DigestPet = {
  pet_id: string;
  pet_name: string;
  done: DigestDoneItem[];
  pending: DigestPendingItem[];
  skipped: DigestDoneItem[];
  alerts: Alert[];
};
export type DigestDoneItem = {
  occurrence_id: string;
  care_request_id?: string;
  title: string;
  by_name: string;
  at: string;
};
export type DigestPendingItem = {
  occurrence_id: string;
  care_request_id?: string;
  care_request_state?: string;
  title: string;
  time_of_day?: string | null;
};
export type Handoff = {
  id: string;
  pet_id: string;
  user_id: string;
  user_name: string;
  started_at: string;
  ends_at?: string | null;
  is_me: boolean;
};

export type CareRequestState =
  | 'sent'
  | 'seen'
  | 'accepted'
  | 'declined'
  | 'delegated'
  | 'expired'
  | 'cancelled';
export type CareRequest = {
  id: string;
  family_id: string;
  family_timezone?: string;
  pet_id: string;
  occurrence_id: string;
  care_plan_id?: string;
  from_user_id: string;
  from_user_name: string;
  target_user_id: string;
  target_user_name: string;
  next_request_id?: string;
  next_target_user_id?: string;
  next_target_user_name?: string;
  state: CareRequestState;
  message: string;
  supersedes_request_id?: string;
  batch_id?: string;
  seen_at?: string;
  responded_at?: string;
  response_note?: string;
  pet_name: string;
  occurrence_title: string;
  occurrence_type: string;
  occurrence_status: string;
  occurrence_completed_by_user_id?: string;
  occurrence_completed_by_name?: string;
  occurrence_completed_at?: string;
  due_at?: string;
  due_date?: string;
  created_at: string;
  updated_at: string;
};

export type CareHandoffBatch = {
  id: string;
  family_id: string;
  family_timezone?: string;
  from_user_id: string;
  from_user_name?: string;
  target_user_id: string;
  target_user_name?: string;
  message: string;
  starts_at?: string | null;
  ends_at?: string | null;
  created_at: string;
  requests: CareRequest[];
  total_count: number;
  open_count: number;
  accepted_count: number;
  declined_count: number;
  resolved_count: number;
};
export type CareHandoffBatchItemResult = {
  occurrence_id: string;
  request_id: string;
  outcome: 'changed' | 'not_selected' | 'not_actionable' | 'already_resolved';
  reason?: string;
  state: CareRequestState;
};
export type CareHandoffBatchResponse = {
  batch: CareHandoffBatch;
  results?: CareHandoffBatchItemResult[];
};
export type CareHandoffBatchDelegationResponse = CareHandoffBatchResponse & {
  previous_batch?: CareHandoffBatch;
};

export type HandoffSummaryPet = {
  pet_id: string;
  pet_name: string;
  pending_today: number;
  handoff: Handoff | null;
};
export type DigestView = { date: string; timezone: string; pets: DigestPet[] };

export type ActivationSummary = {
  families: number;
  active_pets: number;
  pets_with_active_plans: number;
  has_today_items: boolean;
};

export type Capabilities = {
  push_notifications: boolean;
  digest: boolean;
  alerts: boolean;
  export_json: boolean;
  export_pdf: boolean;
  i18n: string[];
  care_responsibility_api?: boolean;
  activation_summary_api?: boolean;
};

export type CareResponsibilityPet = {
  pet_id: string;
  pet_name: string;
  pending_today: number;
  on_duty: Handoff | null;
  show_claim: boolean;
  show_release: boolean;
};

export type CareResponsibilityView = {
  family_id: string;
  pets: CareResponsibilityPet[];
  banner_visible: boolean;
};

export type MeResponse = { user: User; entitlements: Entitlement[] };
export type AuthResponse = { token: string; expires_at: string; user: User; dev_code?: string };
export type FamilyDetailResponse = { family: Family; members: Member[] };
export type FamilyAuditRecord = {
  id: string;
  actor_user_id?: string;
  actor_name: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  occurred_at: string;
  metadata: Record<string, unknown>;
};
/** 邀请码公开预览：出于隐私只返回照护上下文（宠物名/邀请人名），不返回家庭名。 */
export type InvitePreview = {
  role: FamilyMemberRole;
  pet_name: string | null;
  inviter_name?: string | null;
};
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
    update: (body: { display_name?: string; locale?: string }) =>
      apiClient.patch<MeResponse>('/me', body),
    preferences: () =>
      apiClient.get<{ preferences: { default_family_id?: string; default_pet_id?: string } }>(
        '/me/preferences',
      ),
    updatePreferences: (body: {
      default_family_id?: string | null;
      default_pet_id?: string | null;
    }) => apiClient.patch<{ preferences: { default_family_id?: string; default_pet_id?: string } }>(
      '/me/preferences',
      body,
    ),
    usage: () => apiClient.get<Usage>('/me/usage'),
    activationSummary: () => apiClient.get<ActivationSummary>('/me/activation-summary'),
    capabilities: () => apiClient.get<Capabilities>('/me/capabilities'),
    sessions: () => apiClient.get<{ sessions: SessionInfo[] }>('/me/sessions'),
    revokeSession: (sessionId: string) => apiClient.delete<void>(`/me/sessions/${id(sessionId)}`),
    revokeOtherSessions: () => apiClient.delete<void>('/me/sessions?except_current=true'),
    deleteAccount: (confirm: string) => request<void>('/account', { method: 'DELETE', body: { confirm } }),
  },
  today: {
    get: (params?: { date?: string; family_id?: string; pet_id?: string }) => {
      const query = new URLSearchParams();
      if (params?.date) query.set('date', params.date);
      if (params?.family_id) query.set('family_id', params.family_id);
      if (params?.pet_id) query.set('pet_id', params.pet_id);
      const suffix = query.toString() ? `?${query.toString()}` : '';
      return apiClient.get<Today>(`/today${suffix}`);
    },
  },
  families: {
    list: () => apiClient.get<{ families: Family[] }>('/families'),
    deleted: () => apiClient.get<{ families: DeletedFamily[] }>('/families/deleted'),
    detail: (familyId: string) => apiClient.get<FamilyDetailResponse>(`/families/${id(familyId)}`),
    auditRecords: (familyId: string) => apiClient.get<{ records: FamilyAuditRecord[] }>(`/families/${id(familyId)}/audit-records`),
    create: (name: string, timezone?: string, requestKey = createIdempotencyKey()) => apiClient.post<{ family: Family; invite_code: string }>('/families', { name, timezone }, { headers: { 'Idempotency-Key': requestKey } }),
    update: (familyId: string, body: { name?: string; timezone?: string }) => apiClient.patch<{ family: Family }>(`/families/${id(familyId)}`, body),
    refreshInvite: (familyId: string, role: FamilyMemberRole = 'caregiver', requestKey = createIdempotencyKey()) => apiClient.post<{ invite_code: string }>(`/families/${id(familyId)}/invite/refresh`, { role }, { headers: { 'Idempotency-Key': requestKey } }),
    join: (code: string, requestKey = createIdempotencyKey()) => apiClient.post<{ family: Family }>('/families/join', { code }, { headers: { 'Idempotency-Key': requestKey } }),
    removeMember: (familyId: string, userId: string) => apiClient.delete<void>(`/families/${id(familyId)}/members/${id(userId)}`),
    updateMemberRole: (familyId: string, userId: string, role: FamilyMemberRole) => apiClient.patch<void>(`/families/${id(familyId)}/members/${id(userId)}`, { role }),
    leave: (familyId: string) => apiClient.post<void>(`/families/${id(familyId)}/leave`),
    usage: (familyId: string) => apiClient.get<Usage>(`/families/${id(familyId)}/usage`),
    transfer: (familyId: string, to_user_id: string, requestKey = createIdempotencyKey()) => apiClient.post<FamilyDetailResponse>(`/families/${id(familyId)}/transfer`, { to_user_id }, { headers: { 'Idempotency-Key': requestKey } }),
    delete: (familyId: string, confirm: string) => request<void>(`/families/${id(familyId)}`, { method: 'DELETE', body: { confirm } }),
    restore: (familyId: string) => apiClient.post<{ family: Family }>(`/families/${id(familyId)}/restore`),
    invitePreview: (code: string) => apiClient.get<InvitePreview>(`/invite/${id(code)}`),
    pets: (familyId: string) => apiClient.get<{ pets: Pet[] }>(`/families/${id(familyId)}/pets`),
    today: (familyId: string, date?: string) => apiClient.get<Today>(`/families/${id(familyId)}/today${date ? `?date=${encodeURIComponent(date)}` : ''}`),
    alerts: (familyId: string) => apiClient.get<{ alerts: Alert[] }>(`/families/${id(familyId)}/alerts`),
    careRisks: (familyId: string, date?: string) =>
      apiClient.get<{ risks: CareRisk[] }>(
        `/families/${id(familyId)}/care-risks${date ? `?date=${encodeURIComponent(date)}` : ''}`,
      ),
    digest: (familyId: string, date?: string) =>
      apiClient.get<DigestView>(
        `/families/${id(familyId)}/digest${date ? `?date=${encodeURIComponent(date)}` : ''}`,
      ),
    sendDigest: (familyId: string, date?: string) => apiClient.post<Record<string, unknown>>(`/families/${id(familyId)}/digest/send`, date ? { date } : {}),
    notificationPrefs: (familyId: string) => apiClient.get<{ prefs: NotificationPrefs }>(`/families/${id(familyId)}/notification-prefs`),
    updateNotificationPrefs: (familyId: string, body: Partial<NotificationPrefs>) => apiClient.put<{ prefs: NotificationPrefs }>(`/families/${id(familyId)}/notification-prefs`, body),
    careResponsibility: (familyId: string, petId?: string) => {
      const query = petId ? `?pet_id=${id(petId)}` : '';
      return apiClient.get<CareResponsibilityView>(
        `/families/${id(familyId)}/care-responsibility${query}`,
      );
    },
  },
  pets: {
    listAccessible: () => apiClient.get<{ pets: Pet[] }>('/pets'),
    deleted: () => apiClient.get<{ pets: DeletedPet[] }>('/pets/deleted'),
    create: (familyId: string, body: { name: string; species: Pet['species']; breed?: string; birth_date?: string; sex?: Pet['sex']; neutered?: boolean; weight_g?: number }, requestKey = createIdempotencyKey()) => apiClient.post<{ pet: Pet }>(`/families/${id(familyId)}/pets`, body, { headers: { 'Idempotency-Key': requestKey } }),
    list: (familyId: string) => planetApi.families.pets(familyId),
    get: (petId: string) => apiClient.get<PetResponse>(`/pets/${id(petId)}`),
    today: (petId: string, date?: string) => apiClient.get<Today>(`/today?pet_id=${id(petId)}${date ? `&date=${encodeURIComponent(date)}` : ''}`),
    export: (petId: string) => apiClient.get<ExportResponse>(`/pets/${id(petId)}/export`),
    update: (petId: string, body: Record<string, unknown>) => apiClient.patch<{ pet: Pet }>(`/pets/${id(petId)}`, body),
    updateRecord: (petId: string, body: Record<string, unknown>, requestKey = createIdempotencyKey()) => apiClient.patch<{ pet: Pet; profile: Profile }>(`/pets/${id(petId)}/record`, body, { headers: { 'Idempotency-Key': requestKey } }),
    delete: (petId: string) => request<void>(`/pets/${id(petId)}`, { method: 'DELETE', body: { confirm: petId } }),
    restore: (petId: string, requestKey = createIdempotencyKey()) =>
      apiClient.post<{ pet: Pet }>(`/pets/${id(petId)}/restore`, undefined, {
        headers: { 'Idempotency-Key': requestKey },
      }),
    updateProfile: (petId: string, body: Partial<Profile>) => apiClient.patch<{ profile: Profile }>(`/pets/${id(petId)}/profile`, body),
    archive: (petId: string) => apiClient.post<{ pet: Pet }>(`/pets/${id(petId)}/archive`),
    unarchive: (petId: string) => apiClient.post<{ pet: Pet }>(`/pets/${id(petId)}/unarchive`),
    shareFamily: (petId: string, family_id: string, requestKey = createIdempotencyKey()) => apiClient.post<{ ok: boolean; family_id: string }>(`/pets/${id(petId)}/families`, { family_id }, { headers: { 'Idempotency-Key': requestKey } }),
    unshareFamily: (petId: string, familyId: string) => apiClient.delete<void>(`/pets/${id(petId)}/families/${id(familyId)}`),
    removeFromFamily: (petId: string, familyId: string) => apiClient.delete<void>(`/families/${id(familyId)}/pets/${id(petId)}`),
    accessGrants: (petId: string) => apiClient.get<{ grants: AccessGrant[] }>(`/pets/${id(petId)}/access-grants`),
    grantAccess: (petId: string, body: { user_id: string; role: Role; expires_at?: string }, requestKey = createIdempotencyKey()) => apiClient.post<{ grant: AccessGrant }>(`/pets/${id(petId)}/access-grants`, body, { headers: { 'Idempotency-Key': requestKey } }),
    revokeAccess: (petId: string, grantId: string) => apiClient.delete<void>(`/pets/${id(petId)}/access-grants/${id(grantId)}`),
    medications: (petId: string) => apiClient.get<{ medications: Medication[] }>(`/pets/${id(petId)}/medications`),
    createMedication: (petId: string, body: { name: string; dose?: string; schedule?: string; note?: string; family_id?: string }, requestKey = createIdempotencyKey()) => apiClient.post<{ medication: Medication }>(`/pets/${id(petId)}/medications`, body, { headers: { 'Idempotency-Key': requestKey } }),
    carePlans: (petId: string, includeArchived = false, familyId?: string) => {
      const query = new URLSearchParams();
      if (includeArchived) query.set('include_archived', 'true');
      if (familyId) query.set('family_id', id(familyId));
      const suffix = query.toString() ? `?${query.toString()}` : '';
      return apiClient.get<{ care_plans: CarePlanSummary[] }>(`/pets/${id(petId)}/care-plans${suffix}`);
    },
    createCarePlan: (petId: string, body: { family_id?: string; type: CarePlan['type']; title: string; description?: string; rule: { type: 'daily' | 'weekly' | 'monthly' | 'interval'; interval?: number; days?: number[]; day?: number; time?: string; start_date?: string; end_date?: string } }, requestKey = createIdempotencyKey()) => apiClient.post<CarePlanCreateResponse>(`/pets/${id(petId)}/care-plans`, body, { headers: { 'Idempotency-Key': requestKey } }),
    timeline: (petId: string, params?: { before?: string; before_id?: string; limit?: number }) => {
      const query = new URLSearchParams();
      if (params?.before) query.set('before', params.before);
      if (params?.before_id) query.set('before_id', params.before_id);
      if (params?.limit) query.set('limit', String(params.limit));
      const suffix = query.toString() ? `?${query.toString()}` : '';
      return apiClient.get<{ events: TimelineEvent[]; next_cursor?: { before: string; before_id: string } }>(`/pets/${id(petId)}/timeline${suffix}`);
    },
    createEvent: (petId: string, body: { family_id?: string; type: string; occurred_at: string; payload: Record<string, unknown> }, requestKey = createIdempotencyKey()) => apiClient.post<{ event: TimelineEvent }>(`/pets/${id(petId)}/timeline`, body, { headers: { 'Idempotency-Key': requestKey } }),
    shares: (petId: string) => apiClient.get<{ shares: Share[] }>(`/pets/${id(petId)}/shares`),
    createShare: (petId: string, body: { kind: Share['kind']; ttl_hours: number; options?: Record<string, unknown> }, requestKey = createIdempotencyKey()) => apiClient.post<{ share: Share; token: string }>(`/pets/${id(petId)}/shares`, body, { headers: { 'Idempotency-Key': requestKey } }),
    transfer: (petId: string, to_family_id: string, requestKey = createIdempotencyKey(), from_family_id?: string) => apiClient.post<{ transfer: Transfer }>(`/pets/${id(petId)}/transfer`, { to_family_id, ...(from_family_id ? { from_family_id } : {}) }, { headers: { 'Idempotency-Key': requestKey } }),
  },
  medications: {
    update: (medicationId: string, body: Partial<Pick<Medication, 'name' | 'dose' | 'schedule' | 'note'>>) => apiClient.patch<{ medication: Medication }>(`/medications/${id(medicationId)}`, body),
    stop: (medicationId: string, ended_on?: string, family_id?: string, requestKey = createIdempotencyKey()) => apiClient.post<{ medication: Medication }>(`/medications/${id(medicationId)}/stop`, { ...(ended_on ? { ended_on } : {}), ...(family_id ? { family_id } : {}) }, { headers: { 'Idempotency-Key': requestKey } }),
    delete: (medicationId: string) => apiClient.delete<void>(`/medications/${id(medicationId)}`),
  },
  tasks: {
    complete: (taskId: string, body: { status: 'done' | 'skipped'; date?: string; note?: string }, requestKey = createIdempotencyKey()) => apiClient.post<{ log: TaskLog }>(`/care-tasks/${id(taskId)}/complete`, body, { headers: { 'Idempotency-Key': requestKey } }),
    undo: (logId: string, requestKey = createIdempotencyKey()) =>
      apiClient.post<void>(`/task-logs/${id(logId)}/undo`, undefined, {
        headers: { 'Idempotency-Key': requestKey },
      }),
  },
  schedule: {
    applyAction: (body: ScheduleActionRequest, requestKey = createIdempotencyKey()) =>
      apiClient.post<ScheduleActionResponse>('/care-schedule/actions', body, {
        headers: { 'Idempotency-Key': requestKey },
      }),
  },
  carePlans: {
    update: (carePlanId: string, body: { title?: string; description?: string; schedule?: Record<string, unknown>; time_of_day?: string | null; archived?: boolean; status?: 'active' | 'paused' | 'archived' }) => apiClient.patch<{ care_plan: CarePlanSummary }>(`/care-plans/${id(carePlanId)}`, body),
    delete: (carePlanId: string) => apiClient.delete<void>(`/care-plans/${id(carePlanId)}`),
    assignments: (carePlanId: string, familyId?: string) => {
      const suffix = familyId ? `?family_id=${encodeURIComponent(id(familyId))}` : '';
      return apiClient.get<{ assignments: CareAssignment[] }>(`/care-plans/${id(carePlanId)}/assignments${suffix}`);
    },
    setAssignment: (carePlanId: string, userId: string, role: 'helper' = 'helper') => apiClient.put<{ assignment: CareAssignment }>(`/care-plans/${id(carePlanId)}/assignments/${id(userId)}`, { role }),
    moveAssignment: (carePlanId: string, userId: string, direction: 'up' | 'down', requestKey = createIdempotencyKey()) =>
      apiClient.post<{ assignment: CareAssignment }>(`/care-plans/${id(carePlanId)}/assignments/${id(userId)}/move`, { direction }, { headers: { 'Idempotency-Key': requestKey } }),
    removeAssignment: (carePlanId: string, userId: string) => apiClient.delete<void>(`/care-plans/${id(carePlanId)}/assignments/${id(userId)}`),
  },
  timeline: {
    list: (params?: {
      family_id?: string;
      pet_id?: string;
      before?: string;
      before_id?: string;
      limit?: number;
    }) => {
      const query = new URLSearchParams();
      if (params?.family_id) query.set('family_id', params.family_id);
      if (params?.pet_id) query.set('pet_id', params.pet_id);
      if (params?.before) query.set('before', params.before);
      if (params?.before_id) query.set('before_id', params.before_id);
      if (params?.limit) query.set('limit', String(params.limit));
      const suffix = query.toString() ? `?${query.toString()}` : '';
      return apiClient.get<{
        events: TimelineEvent[];
        next_cursor?: { before: string; before_id: string };
      }>(`/timeline${suffix}`);
    },
    update: (eventId: string, body: { occurred_at: string; payload: Record<string, unknown> }) =>
      apiClient.patch<{ event: TimelineEvent }>(`/timeline-events/${id(eventId)}`, body),
    delete: (eventId: string) => apiClient.delete<void>(`/timeline-events/${id(eventId)}`),
  },
  careStats: {
    get: (params: { from: string; to: string; family_id?: string; pet_id?: string }) => {
      const query = new URLSearchParams({ from: params.from, to: params.to });
      if (params.family_id) query.set('family_id', params.family_id);
      if (params.pet_id) query.set('pet_id', params.pet_id);
      return apiClient.get<CareStats>(`/care-stats?${query.toString()}`);
    },
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
  handoffs: {
    get: (petId: string) => apiClient.get<{ handoff: Handoff | null }>(`/pets/${id(petId)}/handoff`),
    claim: (petId: string, body: { note?: string }, requestKey = createIdempotencyKey()) =>
      apiClient.post<{ handoff: Handoff }>(`/pets/${id(petId)}/handoff`, body, { headers: { 'Idempotency-Key': requestKey } }),
    release: (petId: string, body: { note?: string } = {}, requestKey = createIdempotencyKey()) =>
      apiClient.post<void>(`/pets/${id(petId)}/handoff/release`, body, { headers: { 'Idempotency-Key': requestKey } }),
    familySummary: (familyId: string) =>
      apiClient.get<{ pets: HandoffSummaryPet[] }>(`/families/${id(familyId)}/handoff-summary`),
  },
  careRequests: {
    inbox: () => apiClient.get<{ care_requests: CareRequest[] }>('/care-requests/inbox'),
    sent: () => apiClient.get<{ care_requests: CareRequest[] }>('/care-requests/sent'),
    get: (requestId: string) =>
      apiClient.get<{ care_request: CareRequest }>(`/care-requests/${id(requestId)}`),
    chain: (requestId: string) =>
      apiClient.get<{ care_requests: CareRequest[] }>(`/care-requests/${id(requestId)}/chain`),
    create: (
      occurrenceId: string,
      body: { family_id: string; target_user_id: string; message?: string },
      requestKey = createIdempotencyKey(),
    ) =>
      apiClient.post<{ care_request: CareRequest }>(
        `/care-occurrences/${id(occurrenceId)}/requests`,
        body,
        { headers: { 'Idempotency-Key': requestKey } },
      ),
    claim: (familyId: string, occurrenceId: string, requestKey = createIdempotencyKey()) =>
      apiClient.post<{ claim: CareClaim }>(
        `/families/${id(familyId)}/care-occurrences/${id(occurrenceId)}/claim`,
        undefined,
        { headers: { 'Idempotency-Key': requestKey } },
      ),
    seen: (requestId: string) =>
      apiClient.post<{ care_request: CareRequest }>(`/care-requests/${id(requestId)}/seen`, {}),
    accept: (requestId: string, note = '', requestKey = createIdempotencyKey()) =>
      apiClient.post<{ care_request: CareRequest }>(
        `/care-requests/${id(requestId)}/accept`,
        { note },
        { headers: { 'Idempotency-Key': requestKey } },
      ),
    decline: (requestId: string, note = '', requestKey = createIdempotencyKey()) =>
      apiClient.post<{ care_request: CareRequest }>(
        `/care-requests/${id(requestId)}/decline`,
        { note },
        { headers: { 'Idempotency-Key': requestKey } },
      ),
    delegate: (
      requestId: string,
      body: { target_user_id: string; message?: string },
      requestKey = createIdempotencyKey(),
    ) =>
      apiClient.post<{ care_request: CareRequest }>(
        `/care-requests/${id(requestId)}/delegate`,
        body,
        { headers: { 'Idempotency-Key': requestKey } },
      ),
    reassign: (
      requestId: string,
      body: { target_user_id: string; message?: string },
      requestKey = createIdempotencyKey(),
    ) =>
      apiClient.post<{ care_request: CareRequest }>(
        `/care-requests/${id(requestId)}/reassign`,
        body,
        { headers: { 'Idempotency-Key': requestKey } },
    ),
  },
  careHandoffBatches: {
    inbox: () => apiClient.get<{ batches: CareHandoffBatch[] }>('/care-handoff-batches/inbox'),
    get: (batchId: string) =>
      apiClient.get<{ batch: CareHandoffBatch }>(`/care-handoff-batches/${id(batchId)}`),
    create: (
      familyId: string,
      body: {
        target_user_id: string;
        occurrence_ids: string[];
        message?: string;
        starts_at?: string;
        ends_at?: string;
      },
      requestKey = createIdempotencyKey(),
    ) =>
      apiClient.post<{ batch: CareHandoffBatch }>(
        `/families/${id(familyId)}/care-handoff-batches`,
        body,
        { headers: { 'Idempotency-Key': requestKey } },
      ),
    accept: (batchId: string, occurrenceIds: string[] = [], requestKey = createIdempotencyKey()) =>
      apiClient.post<CareHandoffBatchResponse>(
        `/care-handoff-batches/${id(batchId)}/accept`,
        occurrenceIds.length > 0 ? { occurrence_ids: occurrenceIds } : {},
        { headers: { 'Idempotency-Key': requestKey } },
      ),
    decline: (batchId: string, occurrenceIds: string[] = [], requestKey = createIdempotencyKey()) =>
      apiClient.post<CareHandoffBatchResponse>(
        `/care-handoff-batches/${id(batchId)}/decline`,
        occurrenceIds.length > 0 ? { occurrence_ids: occurrenceIds } : {},
        { headers: { 'Idempotency-Key': requestKey } },
      ),
    delegate: (
      batchId: string,
      targetUserId: string,
      occurrenceIds: string[] = [],
      message = '',
      requestKey = createIdempotencyKey(),
    ) =>
      apiClient.post<CareHandoffBatchDelegationResponse>(
        `/care-handoff-batches/${id(batchId)}/delegate`,
        {
          target_user_id: targetUserId,
          ...(occurrenceIds.length > 0 ? { occurrence_ids: occurrenceIds } : {}),
          ...(message ? { message } : {}),
        },
        { headers: { 'Idempotency-Key': requestKey } },
      ),
    reassign: (
      batchId: string,
      targetUserId: string,
      occurrenceIds: string[] = [],
      message = '',
      requestKey = createIdempotencyKey(),
    ) =>
      apiClient.post<CareHandoffBatchDelegationResponse>(
        `/care-handoff-batches/${id(batchId)}/reassign`,
        {
          target_user_id: targetUserId,
          ...(occurrenceIds.length > 0 ? { occurrence_ids: occurrenceIds } : {}),
          ...(message ? { message } : {}),
        },
        { headers: { 'Idempotency-Key': requestKey } },
      ),
  },
  notifications: {
    registerPushToken: (token: string, platform: string) => apiClient.post<{ push_token: Record<string, unknown> }>('/me/push-tokens', { token, platform }),
    deletePushToken: (token: string) => request<void>('/me/push-tokens', { method: 'DELETE', body: { token } }),
  },
};
