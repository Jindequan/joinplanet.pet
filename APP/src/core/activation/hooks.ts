import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../query/keys'
import { readActivationSummary } from './readers'
import { deriveActivationPhase, type ActivationPhase } from './state'

export function useActivation(options: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: queryKeys.activationSummary,
    queryFn: readActivationSummary,
    enabled: options.enabled ?? true,
    staleTime: 30_000,
  })

  const phase: ActivationPhase = query.data
    ? deriveActivationPhase(query.data)
    : 'needs_family'

  return {
    ...query,
    phase,
    summary: query.data,
  }
}
