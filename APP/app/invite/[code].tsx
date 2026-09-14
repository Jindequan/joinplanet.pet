import { useLocalSearchParams } from 'expo-router'
import { FamilyFormScreen } from '../../src/features/families/form-screen'

/** Public invite entry: preview first, then authenticate only when joining. */
export default function InviteRoute() {
  const { code } = useLocalSearchParams<{ code?: string | string[] }>()
  const inviteCode = Array.isArray(code) ? code[0] : code
  return <FamilyFormScreen mode="join" initialCode={inviteCode} publicEntry />
}
