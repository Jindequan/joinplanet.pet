/** Today — 家人照看（L3 延伸，不写第二套待办） */
import { CARE_ACTION_LABELS, HANDOFF_TERMS } from '../../core/presentation/terminology'

export function handoffDutyLine(petName: string, userName: string, isMe: boolean) {
  if (isMe) return `${petName} · 默认由你负责`
  return `${petName} · 默认由 ${userName} 负责`
}

export function handoffClaimLabel() {
  return CARE_ACTION_LABELS.accept
}

export function handoffReleaseLabel() {
  return HANDOFF_TERMS.release
}

export function handoffClaimToast(petName: string) {
  return `已设为默认负责人 · ${petName}`
}

export function handoffReleaseToast() {
  return '已取消你的默认负责人'
}

export function handoffSectionTitle() {
  return '默认负责人'
}

export function handoffNoDutyLine(petName: string) {
  return `${petName} · 尚未设置默认负责人`
}

export function handoffClaimDialogTitle(petName: string) {
  return `照顾 ${petName}`
}

export function handoffReleaseDialogTitle(petName: string) {
  return `取消默认负责人 · ${petName}`
}

export function handoffClaimDialogHint() {
  return '没有单独安排负责人的事项会显示由你负责。'
}

export function handoffReleaseDialogHint() {
  return '取消后，没有默认负责人的事项会继续显示待安排。'
}
