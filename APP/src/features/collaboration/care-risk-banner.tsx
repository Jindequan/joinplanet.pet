import React, { useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import { ArrowRight, Clock, WarningCircle } from 'phosphor-react-native'
import { router } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createIdempotencyKey, type CareRisk } from '../../core/api/planet-api'
import { errorMessage } from '../../core/api/errors'
import { claimCareRisk, readCareRisks } from '../../core/collaboration'
import { queryKeys } from '../../core/query/keys'
import { useTheme } from '../../core/providers/theme-provider'
import { useToast } from '../../core/providers/toast-provider'
import { useScope } from '../../core/providers/scope-provider'
import { formatCareInstant } from '../../core/time/civil'
import { CARE_ACTION_LABELS } from '../../core/presentation/terminology'
import { AppText } from '../../ui/components/app-text'
import { Card } from '../../ui/components/card'
import { QueryErrorState } from '../../ui/components/query-error-state'
import { FadeInView, hapticSuccess, PressableScale } from '../../ui/motion'

type Props = {
  familyId: string
  date: string
  familyName?: string
  canParticipate?: boolean
}

function dueLabel(value: string, timezone?: string) {
  const dueAt = new Date(value)
  if (Number.isNaN(dueAt.getTime())) return ''
  return formatCareInstant(dueAt, timezone, false)
}

function riskCopy(risk: CareRisk, canParticipate: boolean) {
  if (!canParticipate) return '可查看；等待有权限的成员安排'
  if (risk.escalation_failed) return '上一位负责人没有完成，请重新安排'
  if (risk.waiting_on_user) return '还没有人负责'
  return '还没有负责人'
}

export function CareRiskBanner({ familyId, date, familyName, canParticipate = true }: Props) {
  const { theme } = useTheme()
  const { showToast } = useToast()
  const { setScope } = useScope()
  const client = useQueryClient()
  const commandKeys = useRef(new Map<string, string>())
  const query = useQuery({
    queryKey: queryKeys.careRisks(familyId, date),
    queryFn: () => readCareRisks(familyId, date),
    enabled: Boolean(familyId),
  })
  const claim = useMutation({
    mutationFn: ({ risk, requestKey }: { risk: CareRisk; requestKey: string }) =>
      claimCareRisk(familyId, risk.occurrence_id, requestKey),
    onSuccess: (_, variables) => {
      commandKeys.current.delete(variables.risk.occurrence_id)
      void hapticSuccess()
      void client.invalidateQueries({ queryKey: queryKeys.careRisks(familyId) })
      void client.invalidateQueries({ predicate: (item) => item.queryKey[0] === 'today' })
      showToast({ message: `今天由你负责 ${variables.risk.pet_name} 的${variables.risk.title}` })
    },
    onError: (error) => showToast({ message: errorMessage(error) }),
  })

  if (query.isLoading) return null

  // 风险数据不是普通摘要：请求失败时不能静默消失，否则用户会把
  // “没有看到风险”误认为“没有风险”。保留一个可重试的明确状态。
  if (query.isError) {
    return (
      <FadeInView>
        <Card style={styles.card}>
          <View style={styles.header}>
            <WarningCircle size={19} color={theme.colors.coralDark} weight="fill" />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="label">{familyName ? `${familyName} · ` : ''}风险状态未更新</AppText>
              <AppText accessibilityRole="alert" variant="caption" muted>暂时拿不到这家今天的照护风险，请重试。</AppText>
            </View>
          </View>
          <QueryErrorState
            embedded
            message="风险状态暂时无法更新"
            onRetry={() => void query.refetch()}
          />
        </Card>
      </FadeInView>
    )
  }

  if (!query.data?.risks?.length) return null

  function openRisk(risk: CareRisk) {
    setScope({ type: 'family', id: familyId })
    if (risk.request_id) {
      router.push(`/requests/${risk.request_id}` as never)
      return
    }
    router.push({
      pathname: '/(tabs)',
      params: {
        focus_date: date,
        focus_task_id: risk.occurrence_id,
      },
    } as never)
  }

  return (
    <FadeInView>
      <Card style={styles.card}>
        <View style={styles.header}>
          <WarningCircle size={19} color={theme.colors.coralDark} weight="fill" />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="label">{familyName ? `${familyName} · ` : ''}有照护事项还没有负责人</AppText>
            <AppText variant="caption" muted>
              {canParticipate ? '这项照护还没有人负责，请先处理它。' : '你可以查看这项照护；由有权限的成员安排。'}
            </AppText>
          </View>
        </View>

        <View style={styles.list}>
          {query.data.risks.map((risk) => {
            const time = dueLabel(risk.due_at, risk.family_timezone)
            const canClaim = canParticipate && risk.can_claim
            return (
              <View
                key={risk.occurrence_id}
                style={[styles.row, { borderTopColor: theme.colors.line }]}
              >
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={`查看 ${risk.pet_name} 的 ${risk.title}`}
                  onPress={() => openRisk(risk)}
                  style={styles.rowMain}
                >
                  <View style={styles.rowIcon}>
                    <Clock size={16} color={theme.colors.coralDark} weight="bold" />
                  </View>
                  <View style={styles.copy}>
                    <AppText variant="label">{risk.pet_name} · {risk.title}</AppText>
                    <AppText variant="caption" color={theme.colors.coralDark}>{riskCopy(risk, canParticipate)}</AppText>
                    {time ? <AppText variant="caption" muted>临近 {time}</AppText> : null}
                  </View>
                  <ArrowRight size={18} color={theme.colors.forest2} weight="bold" />
                </PressableScale>
                {canClaim ? (
                  <PressableScale
                    accessibilityRole="button"
                    accessibilityLabel={`${CARE_ACTION_LABELS.accept} ${risk.pet_name} 的 ${risk.title}`}
                    disabled={claim.isPending}
                    onPress={() => {
                      const requestKey =
                        commandKeys.current.get(risk.occurrence_id) ?? createIdempotencyKey()
                      commandKeys.current.set(risk.occurrence_id, requestKey)
                      claim.mutate({ risk, requestKey })
                    }}
                    style={[styles.claimButton, { backgroundColor: theme.colors.forest2, opacity: claim.isPending ? 0.55 : 1 }]}
                  >
                    <AppText variant="caption" color={theme.colors.onBrand}>
                      {claim.isPending ? '保存中' : CARE_ACTION_LABELS.accept}
                    </AppText>
                  </PressableScale>
                ) : null}
              </View>
            )
          })}
        </View>
      </Card>
    </FadeInView>
  )
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  list: { gap: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 11,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowIcon: { width: 24, alignItems: 'center' },
  copy: { flex: 1, gap: 2 },
  claimButton: { minHeight: 44, paddingHorizontal: 12, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
})
