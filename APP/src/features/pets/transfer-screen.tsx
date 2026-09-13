import React, { useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { House } from 'phosphor-react-native'
import { createIdempotencyKey, planetApi, type Transfer } from '../../core/api/planet-api'
import { errorMessage } from '../../core/api/errors'
import { timezoneCity } from '../../core/display'
import { invalidateAfterFamilyChange } from '../../core/foundation'
import { queryKeys } from '../../core/query/keys'
import { useTheme } from '../../core/providers/theme-provider'
import { useToast } from '../../core/providers/toast-provider'
import { AppText } from '../../ui/components/app-text'
import { BackHeader } from '../../ui/components/back-header'
import { Button } from '../../ui/components/button'
import { Card } from '../../ui/components/card'
import { LoadingState } from '../../ui/components/loading-state'
import { QueryErrorState } from '../../ui/components/query-error-state'
import { Screen } from '../../ui/components/screen'
import { FadeInView, hapticSelection } from '../../ui/motion'

export function PetTransferScreen({ petId, familyId: routeFamilyId }: { petId: string; familyId?: string }) {
  const { theme } = useTheme()
  const { showToast } = useToast()
  const client = useQueryClient()
  const pet = useQuery({
    queryKey: queryKeys.pet(petId),
    queryFn: () => planetApi.pets.get(petId),
    enabled: Boolean(petId),
  })
  const families = useQuery({
    queryKey: queryKeys.families,
    queryFn: () => planetApi.families.list(),
  })
  const outgoingQueries = useQueries({
    queries: (families.data?.families ?? [])
      .filter((family) => family.role === 'owner')
      .map((family) => ({
        queryKey: queryKeys.transfers(family.id, 'outgoing'),
        queryFn: () => planetApi.transfers.list(family.id, 'outgoing'),
        enabled: Boolean(family.id),
      })),
  })
  const [familyId, setFamilyId] = useState('')
  const [sourceFamilyId, setSourceFamilyId] = useState(routeFamilyId ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const commandKey = useRef<{ sourceFamilyId: string; familyId: string; key: string } | null>(null)
  const cancelKeys = useRef(new Map<string, string>())
  const petFamilyIds = pet.data?.pet.family_ids ?? []
  const sourceFamilies = useMemo(
    () => (families.data?.families ?? []).filter((family) => family.role === 'owner' && petFamilyIds.includes(family.id)),
    [families.data?.families, petFamilyIds],
  )

  if (pet.isLoading || families.isLoading || outgoingQueries.some((query) => query.isLoading)) {
    return (
      <Screen>
        <BackHeader title="转移宠物" fallbackHref={`/pets/${petId}`} />
        <LoadingState label="正在加载宠物转移" />
      </Screen>
    )
  }
  if (pet.error || families.error || !pet.data) {
    return (
      <Screen>
        <BackHeader title="转移宠物" fallbackHref={`/pets/${petId}`} />
        <QueryErrorState
          error={pet.error ?? families.error}
          message={pet.error || families.error ? undefined : '找不到这只宠物'}
          onRetry={() => {
            void pet.refetch()
            void families.refetch()
          }}
        />
      </Screen>
    )
  }

  const current = new Set(petFamilyIds)
  const selectedSourceFamily = sourceFamilies.find((family) => family.id === sourceFamilyId)
  const effectiveSourceFamilyId = selectedSourceFamily?.id ?? sourceFamilies[0]?.id ?? ''
  const options = (families.data?.families ?? []).filter((family) => !current.has(family.id))
  const chosen = options.find((family) => family.id === familyId)
  const outgoing = outgoingQueries.flatMap((query) => query.data?.transfers ?? [])
  const pending = outgoing.find((transfer) => transfer.pet_id === petId && transfer.status === 'pending')
  const pendingSourceFamily = pending
    ? (families.data?.families ?? []).find((family) => family.id === pending.from_family_id)
    : undefined
  const targetFamily = pending
    ? (families.data?.families ?? []).find((family) => family.id === pending.to_family_id)
    : undefined

  async function refreshOutgoing() {
    await Promise.all(outgoingQueries.map((query) => query.refetch()))
  }

  async function transfer() {
    if (!effectiveSourceFamilyId) {
      setError('没有可发起转移的源家庭。请让源家庭管理员操作。')
      return
    }
    if (!familyId) {
      setError('请选择目标家庭。')
      return
    }
    setBusy(true)
    setError('')
    const requestKey =
      commandKey.current?.sourceFamilyId === effectiveSourceFamilyId && commandKey.current?.familyId === familyId
        ? commandKey.current.key
        : createIdempotencyKey()
    commandKey.current = { sourceFamilyId: effectiveSourceFamilyId, familyId, key: requestKey }
    try {
      await planetApi.pets.transfer(petId, familyId, requestKey, effectiveSourceFamilyId)
      commandKey.current = null
      invalidateAfterFamilyChange(client)
      await refreshOutgoing()
      setFamilyId('')
      showToast({ message: '转移请求已发送，等待目标家庭管理员接受。' })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function cancelPending(transfer: Transfer) {
    if (busy) return
    setBusy(true)
    setError('')
    const requestKey = cancelKeys.current.get(transfer.id) ?? createIdempotencyKey()
    cancelKeys.current.set(transfer.id, requestKey)
    try {
      await planetApi.transfers.cancel(transfer.id, requestKey)
      cancelKeys.current.delete(transfer.id)
      invalidateAfterFamilyChange(client)
      await refreshOutgoing()
      showToast({ message: '已撤回转移请求。' })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <BackHeader
        title={`转移 ${pet.data.pet.name}`}
        fallbackHref={`/pets/${petId}`}
        eyebrow="宠物归属"
        subtitle="需要目标家庭的管理员接受后，所有权才会真正变更。"
      />
      <FadeInView>
      <Card style={{ gap: 12 }}>
        {sourceFamilies.length > 1 ? (
          <View style={{ gap: 8 }}>
            <AppText variant="caption" muted style={{ fontWeight: '800' }}>
              从哪个家庭转出
            </AppText>
            {sourceFamilies.map((family) => {
              const selected = family.id === effectiveSourceFamilyId
              return (
                <Pressable
                  key={family.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    void hapticSelection()
                    setSourceFamilyId(family.id)
                    setError('')
                  }}
                  style={[
                    styles.candidate,
                    {
                      borderColor: selected ? theme.colors.forest2 : theme.colors.line,
                      backgroundColor: selected ? theme.colors.sageSoft : theme.colors.paper,
                      borderRadius: theme.radius.md,
                    },
                  ]}
                >
                  <View style={[styles.icon, { backgroundColor: theme.colors.sageSoft }]}>
                    <House size={20} color={theme.colors.forest2} weight="duotone" />
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <AppText variant="label">{family.name}</AppText>
                    <AppText variant="caption" muted>{timezoneCity(family.timezone)} · 你是管理员</AppText>
                  </View>
                </Pressable>
              )
            })}
          </View>
        ) : null}
        {sourceFamilies.length === 0 ? (
          <View style={[styles.sourceWarning, { backgroundColor: theme.colors.coralSoft, borderColor: theme.colors.line }]}>
            <AppText variant="label" color={theme.colors.coralDark}>当前没有可操作的源家庭</AppText>
            <AppText variant="caption" muted>
              转移必须由宠物所在源家庭的管理员发起；请让他打开这只宠物的转移页处理。
            </AppText>
          </View>
        ) : null}
        <View style={[styles.sourceWarning, { backgroundColor: theme.colors.sageSoft, borderColor: theme.colors.line }]}>
          <AppText variant="label" color={theme.colors.forest2}>这是“转移”，不是“共享”</AppText>
          <AppText variant="caption" muted>
            接受后源家庭不再看到这只宠物；时间线、照护记录和照护计划会随宠物保留。需要两边继续查看，请使用共享。
          </AppText>
        </View>
        <AppText variant="caption" muted style={{ fontWeight: '800' }}>
          目标家庭
        </AppText>
        {pending ? (
          <View style={[styles.pending, { backgroundColor: theme.colors.sageSoft, borderColor: theme.colors.line }]}>
            <View style={{ flex: 1, gap: 4 }}>
              <AppText variant="label" color={theme.colors.forest2}>等待对方确认</AppText>
              <AppText variant="caption" muted>
              {pendingSourceFamily?.name ?? '源家庭'} → {targetFamily?.name ?? pending.to_family_id}；目标家庭管理员接受后，{pet.data.pet.name} 会从源家庭移出并进入目标家庭。
              </AppText>
            </View>
            <Button
              label="撤回请求"
              variant="secondary"
              busy={busy}
              onPress={() => void cancelPending(pending)}
            />
          </View>
        ) : sourceFamilies.length === 0 ? (
          <AppText muted>先让源家庭管理员发起转移，目标家庭管理员再确认。</AppText>
        ) : options.length === 0 ? (
          <View style={{ gap: 10 }}>
            <AppText muted>你目前只在一个家庭里；先创建或加入另一个家庭，再发起转移。</AppText>
            <Button
              label="创建家庭"
              variant="secondary"
              onPress={() => router.push('/families/new' as never)}
            />
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {options.map((family) => {
              const selected = family.id === familyId
              return (
                <Pressable
                  key={family.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    void hapticSelection()
                    setFamilyId(family.id)
                    if (error) setError('')
                  }}
                  style={[
                    styles.candidate,
                    {
                      borderColor: selected ? theme.colors.forest2 : theme.colors.line,
                      backgroundColor: selected ? theme.colors.sageSoft : theme.colors.paper,
                      borderRadius: theme.radius.md,
                    },
                  ]}
                >
                  <View style={[styles.icon, { backgroundColor: theme.colors.sageSoft }]}>
                    <House size={20} color={theme.colors.forest2} weight="duotone" />
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <AppText variant="label">{family.name}</AppText>
                    <AppText variant="caption" muted>
                      {timezoneCity(family.timezone)}
                    </AppText>
                  </View>
                </Pressable>
              )
            })}
          </View>
        )}
        {error ? (
          <AppText accessibilityRole="alert" variant="caption" color={theme.colors.danger}>
            {error}
          </AppText>
        ) : null}
        {options.length > 0 && !pending && sourceFamilies.length > 0 ? (
          <Button
            label={chosen ? `发送转移请求给「${chosen.name}」` : '发送转移请求'}
            busy={busy}
            disabled={!familyId}
            onPress={() => void transfer()}
          />
        ) : null}
      </Card>
      </FadeInView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  candidate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 12,
  },
  sourceWarning: {
    gap: 4,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
})
