export type ActivationPhase =
  | 'needs_family'
  | 'needs_pet'
  | 'needs_care_plan'
  | 'ready'

export type ActivationSummary = {
  families: number
  active_pets: number
  pets_with_active_plans: number
  has_today_items: boolean
}

export function deriveActivationPhase(summary: ActivationSummary): ActivationPhase {
  if (summary.families === 0) return 'needs_family'
  if (summary.active_pets === 0) return 'needs_pet'
  if (summary.pets_with_active_plans === 0 && !summary.has_today_items) {
    return 'needs_care_plan'
  }
  return 'ready'
}

/** 开通只在今天页教练；旧激活路由一律落到 Tab。 */
export function activationRoute(_phase: ActivationPhase): string {
  return '/(tabs)'
}
