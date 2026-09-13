import { useLocalSearchParams } from 'expo-router'
import { FamilyTransfersScreen } from '../../../src/features/families/transfers-screen'

export default function FamilyTransfersRoute() {
  const { familyId } = useLocalSearchParams<{ familyId: string }>()
  return <FamilyTransfersScreen familyId={familyId ?? ''} />
}
