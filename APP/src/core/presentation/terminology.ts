/** Unified product terminology — all role / governance copy references this file. */

export const ROLE_LABELS: Record<string, string> = {
  owner: '家庭管理员',
  caregiver: '照护者',
  editor: '可编辑',
  viewer: '可查看',
  read_only: '只读',
  helper: '负责人',
}

export function roleLabel(role: string | undefined): string {
  if (!role) return '成员'
  return ROLE_LABELS[role] ?? role
}

/** The three responsibility actions must read the same everywhere. */
export const CARE_ACTION_LABELS = {
  accept: '我来做',
  decline: '我也不行',
  delegate: '给其他人',
} as const

export const HANDOFF_TERMS = {
  sectionTitle: '默认负责人',
  sectionHint: '用于没有单独安排负责人的事项；已经指定负责人的事项，以事项卡为准。',
  onDutyMe: (petName: string) => `${petName} · 默认由你负责`,
  onDutyOther: (petName: string, name: string) => `${petName} · 默认由 ${name} 负责`,
  noDuty: (petName: string) => `${petName} · 尚未设置默认负责人`,
  claim: CARE_ACTION_LABELS.accept,
  release: '我不再默认负责',
  claimToast: (petName: string) => `已设为默认负责人 · ${petName}`,
  releaseToast: '已取消你的默认负责人',
} as const
