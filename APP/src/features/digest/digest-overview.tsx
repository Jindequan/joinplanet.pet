import React, { useMemo } from 'react'
import { View } from 'react-native'
import { ArrowRight, CheckCircle, Clock, WarningCircle } from 'phosphor-react-native'
import { router } from 'expo-router'
import { useQueries } from '@tanstack/react-query'
import { planetApi, type DigestPet, type Family } from '../../core/api/planet-api'
import { queryKeys } from '../../core/query/keys'
import { useScope } from '../../core/providers/scope-provider'
import { useTheme } from '../../core/providers/theme-provider'
import { AppText } from '../../ui/components/app-text'
import { Card } from '../../ui/components/card'
import { LoadingState } from '../../ui/components/loading-state'
import { QueryErrorState } from '../../ui/components/query-error-state'
import { FadeInView, PressableScale } from '../../ui/motion'

type Props = {
  families: Family[]
  date: string
}

type Summary = {
  pending: number
  done: number
  skipped: number
  alerts: number
}

/**
 * The all-family view needs one piece of orientation, not one full digest
 * card per family. Keep the aggregate here and let a family row be the
 * single-step path to that family's detailed Today view.
 */
export function DigestOverview({ families, date }: Props) {
  const { theme } = useTheme()
  const { setScope } = useScope()
  const queries = useQueries({
    queries: families.map((family) => ({
      queryKey: queryKeys.digest(family.id, date),
      queryFn: () => planetApi.families.digest(family.id, date),
      enabled: Boolean(family.id && date),
    })),
  })

  const rows = useMemo(
    () => families.map((family, index) => ({
      family,
      summary: summarize(queries[index]?.data?.pets ?? []),
      loaded: Boolean(queries[index]?.data),
      failed: Boolean(queries[index]?.isError),
    })),
    [families, queries],
  )
  const loadedRows = rows.filter((row) => row.loaded)
  const allFailed = rows.length > 0 && rows.every((row) => row.failed)
  const allLoading = rows.length > 0 && rows.every((row) => !row.loaded && !row.failed)
  if (allLoading) {
    return (
      <FadeInView>
        <Card style={styles.card}>
          <ViewHeader
            title="今天的家庭状态"
            subtitle={`${families.length} 个家庭 · ${date} · 按家庭统计`}
            color={theme.colors.ink}
          />
          <LoadingState compact label="正在加载家庭摘要" />
        </Card>
      </FadeInView>
    )
  }
  if (allFailed) {
    return (
      <FadeInView>
        <Card style={styles.card}>
          <ViewHeader
            title="今天的家庭状态"
            subtitle={`${families.length} 个家庭 · ${date} · 按家庭统计`}
            color={theme.colors.ink}
          />
          <QueryErrorState
            embedded
            message="家庭摘要暂时无法更新，请重试。"
            onRetry={() => {
              void Promise.all(queries.map((query) => query.refetch()))
            }}
          />
        </Card>
      </FadeInView>
    )
  }
  if (loadedRows.length === 0) return null

  const total = loadedRows.reduce((result, row) => addSummary(result, row.summary), emptySummary())
  const failedCount = rows.filter((row) => row.failed).length

  function openFamily(familyId: string) {
    setScope({ type: 'family', id: familyId })
    router.replace({
      pathname: '/(tabs)',
      params: { family_id: familyId },
    } as never)
  }

  return (
    <FadeInView>
      <Card style={styles.card}>
        <ViewHeader
          title="今天的家庭状态"
          subtitle={`${families.length} 个家庭 · ${date} · 按家庭统计`}
          color={theme.colors.ink}
        />

        <View style={styles.metrics} accessibilityLabel="全部家庭照护统计">
          <Metric
            icon={<Clock size={15} color={theme.colors.coralDark} weight="bold" />}
            label="待处理"
            value={total.pending}
            color={theme.colors.coralDark}
          />
          <Metric
            icon={<CheckCircle size={15} color={theme.colors.forest2} weight="bold" />}
            label="已完成"
            value={total.done}
            color={theme.colors.forest2}
          />
          <Metric
            icon={total.alerts > 0 ? <WarningCircle size={15} color={theme.colors.coralDark} weight="fill" /> : undefined}
            label="预警"
            value={total.alerts}
            color={total.alerts > 0 ? theme.colors.coralDark : theme.colors.muted}
          />
        </View>

        <View style={[styles.familyList, { borderTopColor: theme.colors.line }]}>
          {rows.map(({ family, summary, loaded, failed }) => (
            <PressableScale
              key={family.id}
              accessibilityRole="button"
              accessibilityLabel={`打开 ${family.name}，${familySummary(summary, loaded, failed)}`}
              onPress={() => openFamily(family.id)}
              style={[styles.familyRow, { borderBottomColor: theme.colors.line }]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="label" numberOfLines={1}>{family.name}</AppText>
                <AppText variant="caption" muted numberOfLines={1}>
                  {familySummary(summary, loaded, failed)}
                </AppText>
              </View>
              <ArrowRight size={17} color={theme.colors.forest2} weight="bold" />
            </PressableScale>
          ))}
        </View>

        <AppText variant="caption" color={failedCount > 0 ? theme.colors.coralDark : theme.colors.forest2}>
          {failedCount > 0 ? `${failedCount} 个家庭的摘要暂时没更新 · 点家庭名称查看` : '点家庭名称，查看该家庭的事项和负责人'}
        </AppText>
      </Card>
    </FadeInView>
  )
}

function summarize(pets: DigestPet[]): Summary {
  return pets.reduce(
    (result, pet) => ({
      pending: result.pending + pet.pending.length,
      done: result.done + pet.done.length,
      skipped: result.skipped + pet.skipped.length,
      alerts: result.alerts + pet.alerts.length,
    }),
    emptySummary(),
  )
}

function emptySummary(): Summary {
  return { pending: 0, done: 0, skipped: 0, alerts: 0 }
}

function addSummary(left: Summary, right: Summary): Summary {
  return {
    pending: left.pending + right.pending,
    done: left.done + right.done,
    skipped: left.skipped + right.skipped,
    alerts: left.alerts + right.alerts,
  }
}

function familySummary(summary: Summary, loaded: boolean, failed: boolean) {
  if (failed && !loaded) return '摘要暂时无法更新'
  if (!loaded) return '正在更新…'
  const parts = [
    summary.pending > 0 ? `${summary.pending} 项待处理` : '没有待处理',
    summary.done > 0 ? `${summary.done} 项已完成` : '',
    summary.alerts > 0 ? `${summary.alerts} 条预警` : '',
  ].filter(Boolean)
  return parts.join(' · ')
}

function ViewHeader({ title, subtitle, color }: { title: string; subtitle: string; color: string }) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="label" color={color}>{title}</AppText>
        <AppText variant="caption" muted>{subtitle}</AppText>
      </View>
    </View>
  )
}

function Metric({
  icon,
  label,
  value,
  color,
}: {
  icon?: React.ReactNode
  label: string
  value: number
  color: string
}) {
  return (
    <View style={styles.metric}>
      <View style={styles.metricTop}>
        {icon}
        <AppText variant="title" color={color}>{value}</AppText>
      </View>
      <AppText variant="caption" muted>{label}</AppText>
    </View>
  )
}

const styles = {
  card: { gap: 12 },
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  metrics: { flexDirection: 'row' as const, gap: 8 },
  metric: { flex: 1, gap: 2 },
  metricTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  familyList: { borderTopWidth: 1, marginTop: 2 },
  familyRow: {
    minHeight: 54,
    borderBottomWidth: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
}
