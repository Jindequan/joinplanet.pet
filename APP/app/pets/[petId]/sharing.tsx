import { Redirect, useLocalSearchParams } from 'expo-router'

export default function PetSharingRoute() {
  const { petId, familyId } = useLocalSearchParams<{ petId: string; familyId?: string }>()
  return <Redirect href={`/pets/${petId ?? ''}${familyId ? `?familyId=${encodeURIComponent(familyId)}` : ''}` as never} />
}
