import { useLocalSearchParams } from 'expo-router'
import { TimelineScreen } from '../../../src/features/timeline/screen'

/** Pet 记录是宠物工作区的一部分，锁定 petId，不再跳回全局时间线。 */
export default function PetTimelineRoute() {
  const { petId, familyId } = useLocalSearchParams<{ petId: string; familyId?: string }>()
  return <TimelineScreen petId={petId ?? ''} familyId={familyId} />
}
