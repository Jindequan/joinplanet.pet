import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../query/keys'
import { readCareResponsibility } from './readers'

export function useCareResponsibility(familyId: string, petId?: string) {
  return useQuery({
    queryKey: queryKeys.careResponsibility(familyId, petId),
    queryFn: () => readCareResponsibility(familyId, petId),
    enabled: Boolean(familyId),
    staleTime: 20_000,
  })
}
