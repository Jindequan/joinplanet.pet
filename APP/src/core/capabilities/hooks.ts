import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../query/keys'
import { DEFAULT_CAPABILITIES } from './contracts'
import { readCapabilities } from './readers'

export function useCapabilities() {
  const query = useQuery({
    queryKey: queryKeys.capabilities,
    queryFn: readCapabilities,
    staleTime: 300_000,
  })

  return {
    ...query,
    caps: query.data ?? DEFAULT_CAPABILITIES,
  }
}
