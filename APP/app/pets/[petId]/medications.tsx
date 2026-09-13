import { Redirect, useLocalSearchParams } from 'expo-router'

export default function PetMedicationsRoute() {
  const { petId, familyId } = useLocalSearchParams<{ petId: string; familyId?: string }>()
  return <Redirect href={`/pets/${petId ?? ''}/care${familyId ? `?familyId=${encodeURIComponent(familyId)}` : ''}` as never} />
}
