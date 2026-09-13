import { Redirect } from 'expo-router'

export default function FamilyTab() {
  // Legacy deep links converge on the single request center.
  return <Redirect href="/requests" />
}
