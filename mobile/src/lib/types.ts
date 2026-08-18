/**
 * planet-api DTO 镜像（API-CONTRACT v2）。
 * 宽容解析：所有字段可选化处理——服务端"只增不改"，客户端忽略未知字段、
 * 未知枚举按 string 透传，由渲染层降级为通用卡片/文案。
 */

/* --------------------------------- 账号 --------------------------------- */

export interface UserDTO {
  id: string;
  email: string;
  display_name: string;
  locale?: string;
  created_at?: string;
}

export interface EntitlementDTO {
  key: string;
  source?: string;
  expires_at?: string | null;
}

export interface MeDTO {
  user: UserDTO;
  entitlements: EntitlementDTO[];
}

/* -------------------------------- 家庭/成员 -------------------------------- */

export type Role = 'owner' | 'caregiver' | string;

export interface CircleDTO {
  id: string;
  name: string;
  timezone?: string;
  role?: Role;
  created_at?: string;
}

export interface CircleMemberDTO {
  user_id: string;
  email?: string;
  display_name: string;
  role: Role;
  joined_at?: string;
}

export interface CircleDetailDTO {
  circle: CircleDTO;
  members: CircleMemberDTO[];
}

export interface UsageDTO {
  plan: string;
  members: number;
  member_max: number;
  pets: number;
  pet_max: number;
}

/* --------------------------------- 宠物 --------------------------------- */

export interface PetDTO {
  id: string;
  circle_id: string;
  name: string;
  species: string;
  breed?: string;
  birth_date?: string | null;
  sex?: string;
  neutered?: boolean;
  weight_g?: number | null;
  archived_at?: string | null;
  version?: number;
  created_at?: string;
  updated_at?: string;
}

/** 档案 JSONB 数组元素（应用层校验，宽松解析） */
export interface AllergyItem { name: string; severity?: string; note?: string }
export interface ConditionItem { name: string; since?: string; note?: string }
export interface ContactItem { name: string; phone?: string; relation?: string }

export interface ProfileDTO {
  allergies?: AllergyItem[];
  conditions?: ConditionItem[];
  emergency_contacts?: ContactItem[];
  med_decision_maker?: { name?: string; phone?: string } | null;
  notes?: string;
  updated_at?: string;
}

export interface PetWithProfileDTO {
  pet: PetDTO;
  profile: ProfileDTO;
}

/* --------------------------------- 用药 --------------------------------- */

export interface MedicationDTO {
  id: string;
  pet_id: string;
  name: string;
  dose?: string;
  schedule?: string;
  started_on: string;
  ended_on?: string | null;
  note?: string;
  created_at?: string;
  updated_at?: string;
}

/* ------------------------------- 健康时间线 ------------------------------- */

export type TimelineTypeDTO =
  | 'symptom' | 'weight' | 'medication' | 'vaccine'
  | 'vet_visit' | 'note' | 'document' | 'transfer' | string;

export interface TimelineEventDTO {
  id: string;
  pet_id: string;
  type: TimelineTypeDTO;
  occurred_at: string;
  recorded_by?: string | null;
  recorded_at?: string;
  edited_at?: string | null;
  payload: Record<string, unknown>;
  payload_version?: number;
  source?: string;
}

/* -------------------------------- 今日任务 -------------------------------- */

export interface ScheduleDTO {
  v: number;
  kind: 'daily' | 'weekly' | 'interval' | string;
  days?: number[];
  every_n?: number;
}

export interface TaskDTO {
  id: string;
  circle_id: string;
  pet_id: string;
  title: string;
  schedule: ScheduleDTO;
  time_of_day?: string | null;
  created_at?: string;
  archived_at?: string | null;
}

export interface TaskLogDTO {
  id: string;
  task_id: string;
  log_date: string;
  status: 'done' | 'skipped' | string;
  done_by?: string | null;
  done_by_name?: string | null;
  done_at: string;
  note?: string;
}

export interface TodayItemDTO {
  task: TaskDTO;
  log: TaskLogDTO | null;
}

export interface TodayPetGroupDTO {
  pet_id: string;
  pet_name: string;
  items: TodayItemDTO[];
}

export interface TodayResponseDTO {
  date: string;
  pets: TodayPetGroupDTO[];
}

/* --------------------------------- 分享 --------------------------------- */

export type ShareKind = 'care_card' | 'summary' | string;
export type ShareTTLHours = 24 | 72 | 168 | number;

export interface ShareDTO {
  id: string;
  pet_id: string;
  kind: ShareKind;
  expires_at: string;
  revoked_at?: string | null;
  view_count: number;
  last_viewed_at?: string | null;
  created_at?: string;
}

export interface CreatedShareDTO {
  share: ShareDTO;
  /** 明文 token 仅此一次返回；查看地址 = WEB_SHARE_BASE/s/{token} */
  token: string;
}

/* -------------------------------- 宠物转移 -------------------------------- */

export type TransferStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED' | string;

export interface PetTransferDTO {
  id: string;
  pet_id: string;
  pet_name: string;
  from_circle: string;
  to_circle: string;
  status: TransferStatus;
  created_by: string;
  decided_by?: string;
  created_at: string;
  decided_at?: string | null;
}
