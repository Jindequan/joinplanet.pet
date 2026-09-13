import { useLocalSearchParams } from 'expo-router'
import { PetDetailScreen } from '../../../src/features/pets/detail-screen'

export default function PetIndexRoute() {
  const { petId, familyId } = useLocalSearchParams<{ petId: string; familyId?: string }>()
  return <PetDetailScreen petId={petId ?? ''} familyId={familyId} tab="overview" />
}
