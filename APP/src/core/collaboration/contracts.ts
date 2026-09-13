import type { Handoff, HandoffSummaryPet } from '../api/planet-api'

export type CareResponsibilityPet = {
  pet_id: string
  pet_name: string
  pending_today: number
  on_duty: Handoff | null
  show_claim: boolean
  show_release: boolean
}

export type CareResponsibilityView = {
  family_id: string
  pets: CareResponsibilityPet[]
  /** Only render banner when true */
  banner_visible: boolean
}

export function buildCareResponsibilityView(
  familyId: string,
  rows: HandoffSummaryPet[],
  petIdFilter?: string,
): CareResponsibilityView {
  let pets = rows
  if (petIdFilter) pets = pets.filter((row) => row.pet_id === petIdFilter)

  const enriched: CareResponsibilityPet[] = pets.map((row) => {
    const duty = row.handoff
    const isMe = duty?.is_me ?? false
    return {
      pet_id: row.pet_id,
      pet_name: row.pet_name,
      pending_today: row.pending_today,
      on_duty: duty,
      show_release: Boolean(duty && isMe),
      show_claim: !duty || !isMe,
    }
  })

  const visible = enriched.filter(
    (row) =>
      row.show_release ||
      (row.pending_today > 0 && !row.on_duty) ||
      (row.on_duty && !row.on_duty.is_me),
  )

  return {
    family_id: familyId,
    pets: enriched,
    banner_visible: visible.length > 0,
  }
}
