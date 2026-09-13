import { useLocalSearchParams } from 'expo-router'
import { CareRequestDetailScreen } from '../../src/features/care-requests/detail-screen'

export default function CareRequestDetailRoute() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>()
  return <CareRequestDetailScreen requestId={requestId ?? ''} />
}
