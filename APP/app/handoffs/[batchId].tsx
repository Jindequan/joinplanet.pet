import { useLocalSearchParams } from 'expo-router'
import { CareHandoffBatchDetailScreen } from '../../src/features/care-requests/batch-detail-screen'

export default function HandoffBatchRoute() {
  const { batchId } = useLocalSearchParams<{ batchId: string }>()
  return <CareHandoffBatchDetailScreen batchId={batchId ?? ''} />
}
