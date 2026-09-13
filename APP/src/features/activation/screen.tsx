import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Redirect, router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { foundationReaders } from '../../core/foundation'
import { queryKeys } from '../../core/query/keys'
import { useActivation } from '../../core/activation'
import { useTheme } from '../../core/providers/theme-provider'
import { useSession } from '../../core/providers/session-provider'
import { AppText } from '../../ui/components/app-text'
import { BackHeader } from '../../ui/components/back-header'
import { QueryErrorState } from '../../ui/components/query-error-state'
import { LoadingState } from '../../ui/components/loading-state'
import { Screen } from '../../ui/components/screen'
import { SetupJourney } from '../today/setup-journey'

/**
 * The activation route is a real entry point for an incomplete account.
 * Today still owns the same journey after the user enters the app, but a
 * direct login/deep-link must not silently drop a new account into an empty
 * workspace.
 */
export function ActivationScreen() {
  const { theme } = useTheme()
  const { userId } = useSession()
  const activation = useActivation()
  const families = useQuery({
    queryKey: queryKeys.families,
    queryFn: () => foundationReaders.families(),
  })
  const pets = useQuery({
    queryKey: queryKeys.accessiblePets,
    queryFn: () => foundationReaders.accessiblePets(),
  })

  if (activation.isLoading || families.isLoading || pets.isLoading) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        <BackHeader menu={false} title="开始使用" onBack={() => router.replace('/(tabs)' as never)} />
        <LoadingState label="正在准备你的照护工作区" />
      </Screen>
    )
  }

  if (activation.error || families.error || pets.error) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        <BackHeader menu={false} title="开始使用" onBack={() => router.replace('/(tabs)' as never)} />
        <QueryErrorState
          error={activation.error ?? families.error ?? pets.error}
          message="暂时无法读取你的家庭和宠物"
          onRetry={() => {
            void activation.refetch()
            void families.refetch()
            void pets.refetch()
          }}
        />
      </Screen>
    )
  }

  if (activation.phase === 'ready') return <Redirect href="/(tabs)" />

  const familyCount = families.data?.families.length ?? activation.summary?.families ?? 0
  const activePets = (pets.data?.pets ?? []).filter((pet) => !pet.archived_at)
  const familyId = families.data?.families[0]?.id
  const firstPetId = activePets[0]?.id
  const targetFamily = families.data?.families[0]
  const canManagePet = !targetFamily || targetFamily.role === 'owner'
  const canManageCare = Boolean(
    targetFamily?.role === 'owner' ||
      (firstPetId && activePets[0]?.current_owner_user_id === userId),
  )

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <BackHeader
        menu={false}
        title="开始使用"
        eyebrow="只需三步"
        subtitle="先建立家庭、宠物和一条日常安排，今天页就会有内容。"
        onBack={() => router.replace('/(tabs)' as never)}
      />
      <View style={[styles.intro, { backgroundColor: theme.colors.forest2 }]}>
        <AppText variant="eyebrow" color={theme.colors.mint}>你的工作区还没准备好</AppText>
        <AppText variant="title" color={theme.colors.onBrand}>从一件今天要做的事开始。</AppText>
        <AppText variant="caption" color={theme.colors.onBrandMuted}>
          完成后，家庭成员看到的是同一份照护清单和记录。
        </AppText>
      </View>
      <SetupJourney
        familyCount={familyCount}
        petCount={activePets.length}
        firstPetId={firstPetId}
        familyId={familyId}
        canManagePet={canManagePet}
        canManageCare={canManageCare}
        familyHref={familyId ? `/families/${encodeURIComponent(familyId)}` : '/families'}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  intro: {
    gap: 8,
    borderRadius: 22,
    padding: 20,
  },
})
