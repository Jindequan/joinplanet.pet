import { planetApi } from '../api/planet-api'

export function claimCareRisk(familyId: string, occurrenceId: string, requestKey: string) {
  return planetApi.careRequests.claim(familyId, occurrenceId, requestKey)
}
