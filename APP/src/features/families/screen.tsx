import React from 'react'
import { StyleSheet, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { CaretRight, EnvelopeSimpleOpen, House, ShieldCheck, Users } from 'phosphor-react-native'
import { router } from 'expo-router'
import { planetApi, type Family } from '../../core/api/planet-api'
import { roleLabel, timezoneCity } from '../../core/display'
import { queryKeys } from '../../core/query/keys'
import { useTheme } from '../../core/providers/theme-provider'
import { useScope } from '../../core/providers/scope-provider'
import { AppText } from '../../ui/components/app-text'
import { Button } from '../../ui/components/button'
import { Card } from '../../ui/components/card'
import { BackHeader } from '../../ui/components/back-header'
import { LoadingState } from '../../ui/components/loading-state'
import { PageHeader } from '../../ui/components/page-header'
import { QueryErrorState } from '../../ui/components/query-error-state'
import { Screen } from '../../ui/components/screen'
import { FadeInView, PressableScale } from '../../ui/motion'

export function FamiliesScreen() {
  const { theme } = useTheme()
  const families = useQuery({
    queryKey: queryKeys.families,
    queryFn: () => planetApi.families.list(),
  })
  const familyRows = families.data?.families ?? []

  if (families.isLoading) {
    return (
      <Screen>
        <BackHeader title="家庭" fallbackHref="/more" />
        <LoadingState label="正在加载家庭" />
      </Screen>
    )
  }
  if (families.error) {
    return (
      <Screen>
        <BackHeader title="家庭" fallbackHref="/more" />
        <QueryErrorState error={families.error} onRetry={() => void families.refetch()} />
      </Screen>
    )
  }

  const rows = familyRows

  if (rows.length === 0) {
    return (
      <Screen>
        <BackHeader title="家庭" fallbackHref="/more" />
        <PageHeader description="创建或加入家庭，成员共用宠物照护清单" />
        <FadeInView>
          <Card style={{ gap: 14 }}>
            <AppText variant="eyebrow" soft>
              先建一个家庭
            </AppText>
            <AppText muted>
              建好后，成员可以看到同一份宠物照护安排。
            </AppText>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="新建家庭"
              onPress={() => router.push('/families/new' as never)}
              style={[styles.onboardRow, { borderColor: theme.colors.line, backgroundColor: theme.colors.paper }]}
            >
              <View style={[styles.icon, { backgroundColor: theme.colors.sageSoft }]}>
                <House size={21} color={theme.colors.forest2} weight="duotone" />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="label">新建家庭</AppText>
                <AppText variant="caption" muted>
                  你会成为家庭管理员，接着可以添加宠物和邀请成员。
                </AppText>
              </View>
              <CaretRight size={19} color={theme.colors.soft} />
            </PressableScale>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="加入家庭"
              onPress={() => router.push('/families/join' as never)}
              style={[styles.onboardRow, { borderColor: theme.colors.line, backgroundColor: theme.colors.paper }]}
            >
              <View style={[styles.icon, { backgroundColor: theme.colors.coralSoft }]}>
                <Users size={21} color={theme.colors.coralDark} weight="duotone" />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="label">加入家庭</AppText>
                <AppText variant="caption" muted>
                  有人给了你邀请码？在这里加入已有家庭。
                </AppText>
              </View>
              <CaretRight size={19} color={theme.colors.soft} />
            </PressableScale>
            <View style={styles.privacy}>
              <ShieldCheck size={17} color={theme.colors.mintStrong} />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="label">你们的记录保持私密。</AppText>
                <AppText variant="caption" muted>
                  访问权限跟随家庭角色，管理员随时可以收回。
                </AppText>
              </View>
            </View>
            <Button
              label="恢复已删除的家庭"
              variant="ghost"
              onPress={() => router.push('/settings/deleted-families' as never)}
            />
          </Card>
        </FadeInView>
      </Screen>
    )
  }

  return (
    <Screen>
      <BackHeader
        title="家庭"
        fallbackHref="/more"
        action={
          <Button
            label="新建"
            onPress={() => router.push('/families/new' as never)}
            style={{ paddingHorizontal: 12 }}
          />
        }
      />
      <PageHeader description="选择家庭，查看里面的宠物和照护安排" />

      <FamilyHubSummary
        familyCount={rows.length}
        petCount={rows.reduce((sum, family) => sum + (family.pet_count ?? 0), 0)}
      />

      <View style={{ gap: 10 }}>
        {rows.map((family, index) => (
          <FadeInView key={family.id} index={index}>
            <FamilyRow family={family} />
          </FadeInView>
        ))}
      </View>

      <FadeInView index={rows.length}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="输入邀请码加入家庭"
          onPress={() => router.push('/families/join' as never)}
          style={[
            styles.joinRow,
            {
              borderColor: theme.colors.lineStrong,
              borderRadius: theme.radius.xl,
              backgroundColor: theme.colors.sageSoft,
            },
          ]}
        >
          <EnvelopeSimpleOpen size={20} color={theme.colors.forest2} weight="duotone" />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="label">收到邀请码？</AppText>
            <AppText variant="caption" muted>
              输入邀请码，加入别人已经建好的家庭
            </AppText>
          </View>
          <CaretRight size={18} color={theme.colors.soft} />
        </PressableScale>
      </FadeInView>

      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="恢复已删除的家庭"
        onPress={() => router.push('/settings/deleted-families' as never)}
        style={{ minHeight: 44, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' }}
      >
        <AppText variant="caption" color={theme.colors.forest2}>
          恢复已删除的家庭
        </AppText>
      </PressableScale>
    </Screen>
  )
}

function FamilyHubSummary({
  familyCount,
  petCount,
}: {
  familyCount: number
  petCount: number
}) {
  const { theme } = useTheme()
  return (
    <View
      style={[styles.hubSummary, theme.shadow.card, { backgroundColor: theme.colors.paperStrong, borderColor: theme.colors.line, borderRadius: theme.radius.xl }]}
      accessible
      accessibilityLabel={`家庭概览：${familyCount} 个家庭，${petCount} 只宠物`}
    >
      <View style={styles.hubSummaryTop}>
        <View style={{ flex: 1, gap: 3 }}>
          <AppText variant="eyebrow" color={theme.colors.forest2}>家庭</AppText>
          <AppText variant="title" numberOfLines={1}>
            {familyCount} 个家庭 · {petCount} 只宠物
          </AppText>
          <AppText variant="caption" muted>
            每个家庭有自己的成员、时区和照护安排
          </AppText>
        </View>
      </View>
    </View>
  )
}

/** 列表行只用 list 接口自带的数据；成员/宠物统计放详情页，不再为每行多发两个请求。 */
function FamilyRow({
  family,
}: {
  family: Family
}) {
  const { theme } = useTheme()
  const { setScope } = useScope()
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`打开家庭 ${family.name}`}
      onPress={() => {
        setScope({ type: 'family', id: family.id })
        router.push(`/families/${family.id}` as never)
      }}
      style={[
        styles.familyCard,
        theme.shadow.card,
        {
          backgroundColor: theme.colors.paperStrong,
          borderColor: theme.colors.line,
          borderRadius: theme.radius.xl,
        },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: theme.colors.sageSoft }]}>
        <House size={22} color={theme.colors.forest2} weight="duotone" />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <AppText variant="heading" numberOfLines={1}>
          {family.name}
        </AppText>
        <AppText variant="caption" muted>
          {[
            roleLabel(family.role),
            timezoneCity(family.timezone),
          ].filter(Boolean).join(' · ')}
        </AppText>
      </View>
      <CaretRight size={19} color={theme.colors.soft} />
    </PressableScale>
  )
}


const styles = StyleSheet.create({
  hubSummary: {
    overflow: 'hidden',
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  hubSummaryTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  onboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacy: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingTop: 4 },
  familyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  joinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
})
