import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { ArrowRight, CaretDown, CheckCircle, Clock, WarningCircle } from 'phosphor-react-native'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { planetApi, type Alert, type DigestDoneItem, type DigestPendingItem } from '../../core/api/planet-api'
import { queryKeys } from '../../core/query/keys'
import { useTheme } from '../../core/providers/theme-provider'
import { AppText } from '../../ui/components/app-text'
import { Card } from '../../ui/components/card'
import { QueryErrorState } from '../../ui/components/query-error-state'
import { useScope } from '../../core/providers/scope-provider'
import { FadeInView, PressableScale } from '../../ui/motion'

type Props = {
  familyId: string
  date: string
  familyName?: string
}

type DigestLink = {
  occurrenceId: string
  careRequestId?: string
}

type DigestLinkItem = DigestLink & {
  title: string
  status: 'pending' | 'done' | 'skipped'
}

export function DigestCard({ familyId, date, familyName }: Props) {
  const { theme } = useTheme()
  const { setScope } = useScope()
  const [expanded, setExpanded] = useState(false)
  const query = useQuery({
    queryKey: queryKeys.digest(familyId, date),
    queryFn: () => planetApi.families.digest(familyId, date),
    enabled: Boolean(familyId && date),
  })

  if (query.isLoading) return null

  // 摘要里可能包含体重、用药等预警；接口失败时不能让卡片像“没有问题”一样消失。
  if (query.isError) {
    return (
      <FadeInView>
        <Card style={styles.card}>
          <View style={styles.header}>
            <WarningCircle size={18} color={theme.colors.coralDark} weight="fill" />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="label">{familyName ? `${familyName} · ` : ''}照护摘要未更新</AppText>
              <AppText accessibilityRole="alert" variant="caption" muted>暂时拿不到今天的完成情况和预警。</AppText>
            </View>
          </View>
          <QueryErrorState
            embedded
            message="照护摘要暂时无法更新"
            onRetry={() => void query.refetch()}
          />
        </Card>
      </FadeInView>
    )
  }

  if (!query.data) return null

  const pets = query.data.pets ?? []
  const totals = pets.reduce(
    (result, pet) => ({
      done: result.done + pet.done.length,
      pending: result.pending + pet.pending.length,
      skipped: result.skipped + pet.skipped.length,
      alerts: result.alerts + pet.alerts.length,
    }),
    { done: 0, pending: 0, skipped: 0, alerts: 0 },
  )
  const hasContent = totals.done + totals.pending + totals.skipped + totals.alerts > 0

  function openLink(link: DigestLink) {
    setScope({ type: 'family', id: familyId })
    if (link.careRequestId) {
      router.push(`/requests/${link.careRequestId}` as never)
      return
    }
    router.push({
      pathname: '/(tabs)',
      params: {
        focus_date: date,
        focus_task_id: link.occurrenceId,
      },
    } as never)
  }

  function openAlert(alert: Alert) {
    setScope({ type: 'family', id: familyId })
    router.push(`/pets/${alert.pet_id}/timeline?familyId=${encodeURIComponent(familyId)}` as never)
  }

  return (
    <FadeInView>
      <Card style={styles.card}>
        <View style={styles.header}>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="label">{familyName ? `${familyName} · ` : ''}家庭照护摘要</AppText>
            <AppText variant="caption" muted>
              {query.data.date} · 今天的照护情况
            </AppText>
          </View>
          {hasContent ? (
            <PressableScale
              onPress={() => setExpanded((value) => !value)}
              accessibilityRole="button"
              accessibilityLabel={expanded ? '收起照护摘要明细' : '展开照护摘要明细'}
              accessibilityState={{ expanded }}
              style={styles.expandButton}
            >
              <AppText variant="caption" color={theme.colors.forest2}>
                {expanded ? '收起明细' : '展开明细'}
              </AppText>
              <CaretDown
                size={15}
                color={theme.colors.forest2}
                weight="bold"
                style={expanded ? styles.caretExpanded : undefined}
              />
            </PressableScale>
          ) : null}
        </View>

        <View style={styles.metrics} accessibilityLabel="照护摘要统计">
          <Metric icon={<Clock size={15} color={theme.colors.coralDark} weight="bold" />} label="待处理" value={totals.pending} color={theme.colors.coralDark} />
          <Metric icon={<CheckCircle size={15} color={theme.colors.forest2} weight="bold" />} label="已完成" value={totals.done} color={theme.colors.forest2} />
          <Metric label="已跳过" value={totals.skipped} color={theme.colors.muted} />
          {totals.alerts > 0 ? (
            <Metric icon={<WarningCircle size={15} color={theme.colors.coralDark} weight="fill" />} label="预警" value={totals.alerts} color={theme.colors.coralDark} />
          ) : null}
        </View>

        {!hasContent ? (
          <AppText variant="caption" muted>今天暂无照护记录。</AppText>
        ) : !expanded ? (
          <View style={styles.compactSummary}>
            {totals.pending > 0 ? (
              <AppText variant="caption" color={theme.colors.coralDark}>
                还有 {totals.pending} 项待处理
              </AppText>
            ) : null}
            {totals.alerts > 0 ? (
              <View style={styles.compactAlert}>
                <WarningCircle size={15} color={theme.colors.coralDark} weight="fill" />
                <AppText variant="caption" color={theme.colors.coralDark}>
                  {totals.alerts} 条预警需要查看
                </AppText>
              </View>
            ) : null}
            {totals.pending === 0 && totals.alerts === 0 ? (
              <AppText variant="caption" muted>今天的照护已处理完。</AppText>
            ) : null}
          </View>
        ) : (
          <View style={styles.petList}>
            {pets.map((pet) => {
              const linkedItems = digestItems(pet.pending, pet.done, pet.skipped)
              const hasPetContent = pet.done.length + pet.pending.length + pet.skipped.length + pet.alerts.length > 0
              if (!hasPetContent) return null
              return (
                <View key={pet.pet_id} style={[styles.petButton, { borderColor: theme.colors.line }]}>
                  <View style={styles.petRow}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="label">{pet.pet_name}</AppText>
                      <AppText variant="caption" muted>
                        {pet.pending.length > 0 ? `${pet.pending.length} 项待处理` : '没有待处理事项'}
                        {pet.done.length > 0 ? ` · ${pet.done.length} 项完成` : ''}
                        {pet.alerts.length > 0 ? ` · ${pet.alerts.length} 条预警` : ''}
                      </AppText>
                    </View>
                  </View>
                  {linkedItems.length > 0 ? (
                    <View style={styles.itemList}>
                      {linkedItems.map((item) => (
                        <PressableScale
                          key={item.occurrenceId}
                          onPress={() => openLink(item)}
                          accessibilityRole="button"
                          accessibilityLabel={`查看 ${pet.pet_name} 的 ${item.title}`}
                          style={[styles.itemButton, { borderTopColor: theme.colors.line }]}
                        >
                          <AppText variant="caption" color={item.status === 'pending' ? theme.colors.coralDark : theme.colors.forest2} numberOfLines={1} style={{ flex: 1 }}>
                            {item.status === 'pending' ? '待处理 · ' : item.status === 'done' ? '已完成 · ' : '已跳过 · '}{item.title}
                          </AppText>
                          <ArrowRight size={15} color={theme.colors.forest2} weight="bold" />
                        </PressableScale>
                      ))}
                    </View>
                  ) : null}
                  {pet.alerts.length > 0 ? (
                    <View style={styles.alertList}>
                      {pet.alerts.slice(0, 3).map((alert) => (
                        <PressableScale
                          key={alert.id}
                          onPress={() => openAlert(alert)}
                          accessibilityRole="button"
                          accessibilityLabel={`查看 ${pet.pet_name} 的预警：${alert.title}`}
                          style={[styles.alertButton, { borderTopColor: theme.colors.line }]}
                        >
                          <WarningCircle size={15} color={theme.colors.coralDark} weight="fill" />
                          <View style={styles.alertCopy}>
                            <AppText variant="caption" color={theme.colors.coralDark} numberOfLines={1}>
                              {alert.title}
                            </AppText>
                            <AppText variant="caption" muted numberOfLines={2}>
                              {alert.body}
                            </AppText>
                          </View>
                          <ArrowRight size={15} color={theme.colors.forest2} weight="bold" />
                        </PressableScale>
                      ))}
                      {pet.alerts.length > 3 ? (
                        <AppText variant="caption" muted style={styles.moreAlerts}>
                          还有 {pet.alerts.length - 3} 条预警
                        </AppText>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              )
            })}
          </View>
        )}

        <AppText variant="caption" color={theme.colors.forest2}>
          点击照护事项回到原来的事{pets.some((pet) => pet.pending.some((item) => item.care_request_id)) ? '并查看安排详情' : ''}；点击预警查看宠物记录
        </AppText>
      </Card>
    </FadeInView>
  )
}

function digestItems(
  pending: DigestPendingItem[],
  done: DigestDoneItem[],
  skipped: DigestDoneItem[],
): DigestLinkItem[] {
  return [
    ...pending.map((item) => ({
      occurrenceId: item.occurrence_id,
      careRequestId: item.care_request_id,
      title: item.title,
      status: 'pending' as const,
    })),
    ...done.map((item) => ({
      occurrenceId: item.occurrence_id,
      careRequestId: item.care_request_id,
      title: item.title,
      status: 'done' as const,
    })),
    ...skipped.map((item) => ({
      occurrenceId: item.occurrence_id,
      careRequestId: item.care_request_id,
      title: item.title,
      status: 'skipped' as const,
    })),
  ].slice(0, 5)
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

const styles = StyleSheet.create({
  card: { gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  expandButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 2 },
  caretExpanded: { transform: [{ rotate: '180deg' }] },
  metrics: { flexDirection: 'row', gap: 8 },
  metric: { flex: 1, gap: 2 },
  metricTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  compactSummary: { gap: 8 },
  compactAlert: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  petList: { gap: 8 },
  petButton: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 9 },
  petRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemList: { marginTop: 8 },
  itemButton: { minHeight: 44, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 7 },
  alertList: { marginTop: 8 },
  alertButton: { minHeight: 48, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 },
  alertCopy: { flex: 1, gap: 2 },
  moreAlerts: { paddingTop: 8 },
})
