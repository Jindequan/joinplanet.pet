import { useLocalSearchParams } from 'expo-router'
import { AssignmentsScreen } from '../../../../../src/features/pets/assignments-screen'

export default function AssignmentsRoute() {
  const { petId, planId, familyId } = useLocalSearchParams<{ petId: string; planId: string; familyId?: string }>()
  return <AssignmentsScreen petId={petId ?? ''} planId={planId ?? ''} familyId={familyId} />
}
