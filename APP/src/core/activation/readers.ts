import { planetApi } from '../api/planet-api'
import { isApiError } from '../api/errors'
import { foundationReaders, resolveTodayQuery } from '../foundation'
import { civilToday } from '../time/civil'
import type { ActivationSummary } from './state'

async function aggregateActivationSummary(): Promise<ActivationSummary> {
  const [familiesRes, petsRes, todayRes] = await Promise.all([
    foundationReaders.families(),
    foundationReaders.accessiblePets(),
    foundationReaders.today(
      resolveTodayQuery({
        scopeType: 'all',
        selectedDate: '',
        civilToday: civilToday(),
      }),
    ),
  ])

  const activePets = (petsRes.pets ?? []).filter((pet) => !pet.archived_at)
  const todayItems = (todayRes.pets ?? []).flatMap((group) => group.items)
  const hasTodayItems = todayItems.some((item) => !item.log)

  let petsWithActivePlans = 0
  if (activePets.length > 0 && activePets.length <= 12) {
    const planResults = await Promise.all(
      activePets.map(async (pet) => {
        const res = await planetApi.pets.carePlans(pet.id)
        return (res.care_plans ?? []).some(
          (plan) => (plan as { status?: string }).status === 'active',
        )
      }),
    )
    petsWithActivePlans = planResults.filter(Boolean).length
  } else if (hasTodayItems) {
    petsWithActivePlans = activePets.length
  }

  return {
    families: familiesRes.families?.length ?? 0,
    active_pets: activePets.length,
    pets_with_active_plans: petsWithActivePlans,
    has_today_items: hasTodayItems,
  }
}

export async function readActivationSummary(): Promise<ActivationSummary> {
  try {
    return await planetApi.me.activationSummary()
  } catch (error) {
    // Keep older deployments usable while the server rolls out the compact
    // read model. Do not hide real 5xx/network failures behind extra fan-out.
    if (isApiError(error) && (error.status === 404 || error.status === 501)) {
      return aggregateActivationSummary()
    }
    throw error
  }
}
