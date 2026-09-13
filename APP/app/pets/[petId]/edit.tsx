import { useLocalSearchParams } from 'expo-router'
import { PetEditScreen } from '../../../src/features/pets/edit-screen'

export default function PetEditRoute() {
  const { petId, familyId } = useLocalSearchParams<{ petId: string; familyId?: string }>()
  return <PetEditScreen petId={petId ?? ''} familyId={familyId} />
}
