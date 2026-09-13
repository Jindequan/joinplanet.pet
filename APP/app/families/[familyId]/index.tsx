import { useLocalSearchParams } from 'expo-router'
import { FamilyDetailScreen } from '../../../src/features/families/detail-screen'

export default function FamilyDetailRoute() {
  const { familyId, invite } = useLocalSearchParams<{ familyId: string; invite?: string }>()
  return <FamilyDetailScreen familyId={familyId ?? ''} openInvite={invite === '1'} />
}
