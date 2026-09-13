import { planetApi, type CareRisk } from '../api/planet-api'
import { isApiError } from '../api/errors'
import { extensionReaders } from '../extension'
import { buildCareResponsibilityView, type CareResponsibilityView } from './contracts'

export async function readCareResponsibility(
  familyId: string,
  petId?: string,
): Promise<CareResponsibilityView> {
  try {
    return await planetApi.families.careResponsibility(familyId, petId)
  } catch (error) {
    // Keep older API deployments usable while the formal read model rolls out.
    if (!isApiError(error) || error.status !== 404) throw error
    const summary = await extensionReaders.handoffSummary(familyId)
    return buildCareResponsibilityView(familyId, summary.pets ?? [], petId)
  }
}

export async function readCareRisks(familyId: string, date?: string): Promise<{ risks: CareRisk[] }> {
  return planetApi.families.careRisks(familyId, date)
}
