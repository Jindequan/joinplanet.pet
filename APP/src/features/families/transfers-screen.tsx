import React, { useRef, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createIdempotencyKey, planetApi, type Transfer } from '../../core/api/planet-api'
import { errorMessage } from '../../core/api/errors'
import { TRANSFER_STATUS_LABELS } from '../../core/display'
import { invalidateAfterFamilyChange } from '../../core/foundation'
import { queryKeys } from '../../core/query/keys'
import { useTheme } from '../../core/providers/theme-provider'
import { useToast } from '../../core/providers/toast-provider'
import { AppText } from '../../ui/components/app-text'
import { BackHeader } from '../../ui/components/back-header'
import { Button } from '../../ui/components/button'
import { Card } from '../../ui/components/card'
import { ConfirmDialog } from '../../ui/components/confirm-dialog'
import { EmptyState } from '../../ui/components/empty-state'
import { LoadingState } from '../../ui/components/loading-state'
import { QueryErrorState } from '../../ui/components/query-error-state'
import { Screen } from '../../ui/components/screen'
import { FadeInView, hapticSelection } from '../../ui/motion'

function transferStatus(status: string) {
  return TRANSFER_STATUS_LABELS[status] ?? status
}

export function FamilyTransfersScreen({ familyId }: { familyId: string }) {
  const { theme } = useTheme()
  const { showToast } = useToast()
  const client = useQueryClient()
  const [direction, setDirection] = useState<'incoming' | 'outgoing'>('incoming')
  const [decision, setDecision] = useState<{
    transfer: Transfer
    action: 'accept' | 'decline' | 'cancel'
  } | null>(null)
  const [busyTransferId, setBusyTransferId] = useState('')
  const [error, setError] = useState('')
  const commandKeys = useRef(new Map<string, string>())

  const query = useQuery({
    queryKey: queryKeys.transfers(familyId, direction),
    queryFn: () => planetApi.transfers.list(familyId, direction),
    enabled: Boolean(familyId),
  })

  async function act(transfer: Transfer, action: 'accept' | 'decline' | 'cancel'): Promise<boolean> {
    setError('')
    setBusyTransferId(transfer.id)
    const commandScope = `${transfer.id}:${action}`
    const requestKey = commandKeys.current.get(commandScope) ?? createIdempotencyKey()
    commandKeys.current.set(commandScope, requestKey)
    try {
      if (action === 'cancel') await planetApi.transfers.cancel(transfer.id, requestKey)
      else if (action === 'accept')
        await planetApi.transfers.accept(transfer.id, requestKey)
      else await planetApi.transfers.decline(transfer.id, requestKey)
      commandKeys.current.delete(commandScope)
      await query.refetch()
      invalidateAfterFamilyChange(client)
      showToast({
        message: `转移请求已${action === 'accept' ? '接受' : action === 'decline' ? '婉拒' : '取消'}。`,
      })
      return true
    } catch (e) {
      setError(errorMessage(e))
      return false
    } finally {
      setBusyTransferId('')
    }
  }

  if (query.isLoading) {
    return (
      <Screen>
        <BackHeader title="宠物转移" fallbackHref={`/families/${familyId}`} />
        <LoadingState label="正在加载宠物转移记录" />
      </Screen>
    )
  }
  if (query.error) {
    return (
      <Screen>
        <BackHeader title="宠物转移" fallbackHref={`/families/${familyId}`} />
        <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />
      </Screen>
    )
  }

  const transfers = query.data?.transfers ?? []

  return (
    <Screen>
      <BackHeader
        title="转移请求"
        fallbackHref={`/families/${familyId}`}
        eyebrow="宠物归属"
        subtitle="只有目标家庭的管理员接受后，所有权才会变更。"
      />
      <FadeInView>
      <View
        style={[
          styles.segmented,
          { backgroundColor: theme.colors.sageSoft, borderRadius: theme.radius.lg },
        ]}
      >
        {(
          [
            ['incoming', '收到的'],
            ['outgoing', '发出的'],
          ] as const
        ).map(([value, label]) => {
          const selected = direction === value
          return (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={label}
              onPress={() => {
                if (selected) return
                void hapticSelection()
                setDirection(value)
              }}
              style={[
                styles.segBtn,
                {
                  backgroundColor: selected ? theme.colors.paperStrong : 'transparent',
                  borderRadius: theme.radius.md,
                },
              ]}
            >
              <AppText
                variant="caption"
                color={selected ? theme.colors.ink : theme.colors.muted}
                style={{ fontWeight: '800' }}
              >
                {label}
              </AppText>
            </Pressable>
          )
        })}
      </View>

      {transfers.length === 0 ? (
        <EmptyState
          title="暂无转移请求"
          description={
            direction === 'incoming'
              ? '别的家庭转来宠物时，待处理的请求会显示在这里。'
              : '这个家庭发出的转移请求会显示在这里。'
          }
        />
      ) : (
        <View style={{ gap: 10 }}>
          {transfers.map((transfer) => (
            <Card key={transfer.id} style={styles.row}>
              <View style={{ flex: 1, gap: 4 }}>
                <AppText variant="heading">
                  {transfer.pet_name || transfer.pet_id}
                </AppText>
                <AppText variant="caption" muted>
                  {transferStatus(transfer.status)} ·{' '}
                  {new Date(transfer.created_at).toLocaleString('zh-CN')}
                </AppText>
              </View>
              {transfer.status === 'pending' ? (
                direction === 'incoming' ? (
                  <View style={styles.actions}>
                    <Button
                      label="接受"
                      disabled={busyTransferId === transfer.id}
                      onPress={() => setDecision({ transfer, action: 'accept' })}
                    />
                    <Button
                      label="婉拒"
                      variant="ghost"
                      disabled={busyTransferId === transfer.id}
                      onPress={() => setDecision({ transfer, action: 'decline' })}
                    />
                  </View>
                ) : (
                  <Button
                    label="取消请求"
                    variant="ghost"
                    onPress={() => setDecision({ transfer, action: 'cancel' })}
                  />
                )
              ) : null}
            </Card>
          ))}
        </View>
      )}

      {error ? (
        <AppText accessibilityRole="alert" variant="caption" color={theme.colors.danger}>
          {error}
        </AppText>
      ) : null}

      </FadeInView>

      <ConfirmDialog
        visible={Boolean(decision)}
        title={decision ? decisionTitle(decision.action, decision.transfer.pet_name) : ''}
        consequence={decision ? decisionConsequence(decision.action) : ''}
        confirmLabel={decision ? decisionLabel(decision.action) : '确认'}
        onCancel={() => setDecision(null)}
        onConfirm={async () => {
          if (!decision) return
          const succeeded = await act(decision.transfer, decision.action)
          if (succeeded) setDecision(null)
        }}
      />
    </Screen>
  )
}

function decisionTitle(action: 'accept' | 'decline' | 'cancel', petName?: string) {
  const subject = petName || '这只宠物'
  if (action === 'accept') return `接受 ${subject} 的转移？`
  if (action === 'decline') return `婉拒 ${subject} 的转移？`
  return `取消 ${subject} 的转移？`
}

function decisionConsequence(action: 'accept' | 'decline' | 'cancel') {
  if (action === 'accept') return '接受后，这只宠物会进入本家庭，所有权、照护计划和后续待办会切换到本家庭。'
  if (action === 'decline') return '婉拒后，这条请求会结束；对方需要重新发起转移。'
  return '取消后，目标家庭将无法再接受这条请求。'
}

function decisionLabel(action: 'accept' | 'decline' | 'cancel') {
  if (action === 'accept') return '接受转移'
  if (action === 'decline') return '婉拒转移'
  return '取消转移'
}

const styles = StyleSheet.create({
  segmented: { flexDirection: 'row', padding: 4, gap: 4 },
  segBtn: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actions: { gap: 6 },
})
