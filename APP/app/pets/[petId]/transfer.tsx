import { useLocalSearchParams } from 'expo-router'
import { PetTransferScreen } from '../../../src/features/pets/transfer-screen'

export default function PetTransferRoute() {
  const { petId, familyId } = useLocalSearchParams<{ petId: string; familyId?: string }>()
  return <PetTransferScreen petId={petId ?? ''} familyId={familyId} />
}
