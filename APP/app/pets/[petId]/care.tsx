import React from 'react'
import { useLocalSearchParams, router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { planetApi } from '../../../src/core/api/planet-api'
import { queryKeys } from '../../../src/core/query/keys'
import { BackHeader } from '../../../src/ui/components/back-header'
import { Button } from '../../../src/ui/components/button'
import { LoadingState } from '../../../src/ui/components/loading-state'
import { QueryErrorState } from '../../../src/ui/components/query-error-state'
import { Screen } from '../../../src/ui/components/screen'
import { CareSection } from '../../../src/features/pets/care-section'
import { PetDetailScreen } from '../../../src/features/pets/detail-screen'
import { FadeInView } from '../../../src/ui/motion'
import { useSession } from '../../../src/core/providers/session-provider'

export default function PetCareRoute() {
  const { petId = '', setup, familyId } = useLocalSearchParams<{ petId: string; setup?: string; familyId?: string }>()
  const isSetup = setup === '1'

  if (!isSetup) {
    return <PetDetailScreen petId={petId} familyId={familyId} tab="care" />
  }

  return <CareSetupScreen petId={petId} familyId={familyId} />
}

function CareSetupScreen({ petId, familyId: routeFamilyId }: { petId: string; familyId?: string }) {
  const { userId } = useSession()
  const petQuery = useQuery({
    queryKey: queryKeys.pet(petId),
    queryFn: () => planetApi.pets.get(petId),
    enabled: Boolean(petId),
  })
  const families = useQuery({
    queryKey: queryKeys.families,
    queryFn: () => planetApi.families.list(),
  })

  if (petQuery.isLoading) {
    return (
      <Screen>
        <BackHeader title="照护" onBack={() => router.replace(todayHref(routeFamilyId, petId) as never)} />
        <LoadingState label="正在加载宠物照护" />
      </Screen>
    )
  }

  if (petQuery.error || !petQuery.data) {
    return (
      <Screen>
        <BackHeader title="照护" onBack={() => router.replace(todayHref(routeFamilyId, petId) as never)} />
        <QueryErrorState
          error={petQuery.error}
          message={petQuery.error ? undefined : '宠物不可见'}
          onRetry={() => void petQuery.refetch()}
        />
      </Screen>
    )
  }

  const { pet } = petQuery.data
  if (families.isLoading) {
    return (
      <Screen>
      <BackHeader title={pet.name} eyebrow="第三步" subtitle="正在确认家庭时区…" onBack={() => router.replace(todayHref(routeFamilyId, petId) as never)} />
        <LoadingState label="正在确认家庭时区" />
      </Screen>
    )
  }

  if (families.error) {
    return (
      <Screen>
      <BackHeader title={pet.name} eyebrow="第三步" subtitle="无法确认家庭时区" onBack={() => router.replace(todayHref(routeFamilyId, petId) as never)} />
        <QueryErrorState error={families.error} onRetry={() => void families.refetch()} />
      </Screen>
    )
  }

  const linkedFamilies = (families.data?.families ?? []).filter((family) =>
    (pet.family_ids ?? []).includes(family.id),
  )
  const family = routeFamilyId
    ? linkedFamilies.find((candidate) => candidate.id === routeFamilyId)
    : linkedFamilies.length === 1
      ? linkedFamilies[0]
      : undefined
  if (!family) {
    return (
      <Screen>
      <BackHeader title={pet.name} eyebrow="第三步" subtitle="需要先确定它属于哪个家庭" onBack={() => router.replace(todayHref(routeFamilyId, petId) as never)} />
        <QueryErrorState
          message={linkedFamilies.length === 0
            ? '暂时找不到这只宠物所属的家庭，请返回后重试。'
            : routeFamilyId
              ? '链接里的家庭无权查看这只宠物，请返回后重新选择。'
              : '这只宠物属于多个家庭，请从宠物页选择家庭后再添加照护。'}
          onRetry={() => void families.refetch()}
        />
        <Button label="回到宠物" onPress={() => router.replace(`/pets/${pet.id}${routeFamilyId ? `?familyId=${encodeURIComponent(routeFamilyId)}` : ''}` as never)} />
      </Screen>
    )
  }

  return (
    <Screen>
      <BackHeader
        title={pet.name}
        eyebrow="第三步"
        subtitle="选一条日常照护，今天清单里就会出现"
        onBack={() => router.replace(todayHref(family.id, pet.id) as never)}
      />
      <FadeInView>
        <CareSection
          pet={pet}
          timezone={family.timezone}
          familyId={family.id}
          setup
          canManagePlans={
            !pet.archived_at &&
            (pet.current_owner_user_id === userId || family.role === 'owner')
          }
        />
      </FadeInView>
    </Screen>
  )
}

function todayHref(familyId?: string, petId?: string) {
  const params = new URLSearchParams()
  if (familyId) params.set('family_id', familyId)
  if (petId) params.set('pet_id', petId)
  const query = params.toString()
  // Go straight to the tab group so the auth/root redirect does not discard
  // the pet and family context while the setup flow returns to Today.
  return query ? `/(tabs)?${query}` : '/(tabs)'
}
