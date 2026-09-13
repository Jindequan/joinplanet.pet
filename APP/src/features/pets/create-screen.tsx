import React, { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { router, useLocalSearchParams } from 'expo-router'
import {
  createIdempotencyKey,
  planetApi,
  type Family,
  type Pet,
} from '../../core/api/planet-api'
import { errorMessage } from '../../core/api/errors'
import { queryKeys } from '../../core/query/keys'
import { invalidateAfterPetChange } from '../../core/foundation'
import { useTheme } from '../../core/providers/theme-provider'
import { useToast } from '../../core/providers/toast-provider'
import { useScope } from '../../core/providers/scope-provider'
import { AppText } from '../../ui/components/app-text'
import { BackHeader } from '../../ui/components/back-header'
import { Button } from '../../ui/components/button'
import { ChoiceChips } from '../../ui/components/choice-chips'
import { LoadingState } from '../../ui/components/loading-state'
import { QueryErrorState } from '../../ui/components/query-error-state'
import { Screen } from '../../ui/components/screen'
import { TextField } from '../../ui/components/text-field'
import { FadeInView, hapticSuccess } from '../../ui/motion'
import { SpeciesPicker } from './species-picker'

type Props = {
  families: Family[]
  guided?: boolean
  preferredFamilyId?: string
  /** A family-scoped entry point must not silently switch to another family. */
  lockedFamilyId?: string
}

export function CreatePetScreen({ families, guided = false, preferredFamilyId, lockedFamilyId }: Props) {
  const { theme } = useTheme()
  const { showToast } = useToast()
  const { setScope } = useScope()
  const client = useQueryClient()
  const [familyId, setFamilyId] = useState(
    lockedFamilyId && families.some((family) => family.id === lockedFamilyId)
      ? lockedFamilyId
      : preferredFamilyId && families.some((family) => family.id === preferredFamilyId)
        ? preferredFamilyId
      : families[0]?.id ?? '',
  )
  const [familyTouched, setFamilyTouched] = useState(false)
  const [name, setName] = useState('')
  const [species, setSpecies] = useState<Pet['species']>('dog')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const commandId = useRef(createIdempotencyKey())

  useEffect(() => {
    if (familyTouched) return
    const targetFamilyId = lockedFamilyId ?? preferredFamilyId
    if (targetFamilyId && families.some((family) => family.id === targetFamilyId)) {
      setFamilyId(targetFamilyId)
    }
  }, [families, familyTouched, lockedFamilyId, preferredFamilyId])

  async function save() {
    if (!familyId || !name.trim()) {
      setError('请填写名字。')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await planetApi.pets.create(
        familyId,
        {
          name: name.trim(),
          species,
        },
        commandId.current,
      )
      commandId.current = createIdempotencyKey()
      invalidateAfterPetChange(client, result.pet.id)
      // The next setup step and Today must stay scoped to this new pet.
      setScope({ type: 'pet', id: result.pet.id, familyId })
      void hapticSuccess()
      showToast({ message: `${result.pet.name} 已添加` })
      router.replace(`/pets/${result.pet.id}/care?setup=1&familyId=${encodeURIComponent(familyId)}` as never)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <BackHeader
        title="添加宠物"
        fallbackHref={lockedFamilyId ? `/families/${lockedFamilyId}` : '/pets'}
        subtitle={
          guided
            ? '家庭已经有了。名字和物种就能开始，接下来设置照护。'
            : '名字和物种就能开始，其余以后在档案里补'
        }
      />
      <FadeInView>
        <View style={{ gap: 14 }}>
          <TextField label="名字" value={name} onChangeText={setName} maxLength={60} autoFocus />
          <SpeciesPicker value={species} onChange={setSpecies} />
          {families.length > 1 && !lockedFamilyId ? (
            <ChoiceChips
              label="所属家庭"
              options={families.map((family) => ({ value: family.id, label: family.name }))}
              value={familyId}
              onChange={(value) => {
                setFamilyTouched(true)
                setFamilyId(value)
              }}
            />
          ) : (
            <AppText variant="caption" muted>
              将添加到「{families.find((family) => family.id === familyId)?.name ?? families[0]?.name ?? ''}」，全家都能看到它。
            </AppText>
          )}
          {error ? (
            <AppText accessibilityRole="alert" variant="caption" color={theme.colors.danger}>
              {error}
            </AppText>
          ) : null}
          <Button
            label="添加并设置照护"
            full
            busy={busy}
            disabled={!name.trim()}
            onPress={() => void save()}
            style={{ marginTop: 4 }}
          />
        </View>
      </FadeInView>
    </Screen>
  )
}

export function CreatePetRoute() {
  const { guided, family_id: routeFamilyId } = useLocalSearchParams<{
    guided?: string | string[]
    family_id?: string | string[]
  }>()
  const requestedFamilyId = typeof routeFamilyId === 'string' ? routeFamilyId : undefined
  const invalidFamilyParam = routeFamilyId !== undefined && typeof routeFamilyId !== 'string'
  const families = useQuery({
    queryKey: queryKeys.families,
    queryFn: () => planetApi.families.list(),
  })
  const preferences = useQuery({
    queryKey: queryKeys.preferences,
    queryFn: () => planetApi.me.preferences(),
  })
  if (families.isLoading) {
    return (
      <Screen>
        <BackHeader title="添加宠物" fallbackHref="/pets" />
        <LoadingState label="正在加载家庭列表" />
      </Screen>
    )
  }
  if (families.error) {
    return (
      <Screen>
        <BackHeader title="添加宠物" fallbackHref="/pets" />
        <QueryErrorState error={families.error} onRetry={() => void families.refetch()} />
      </Screen>
    )
  }
  const rows = families.data?.families ?? []
  const requestedFamily = requestedFamilyId
    ? rows.find((family) => family.id === requestedFamilyId)
    : undefined
  if (invalidFamilyParam || (requestedFamilyId && !requestedFamily)) {
    return (
      <Screen>
        <BackHeader title="添加宠物" fallbackHref="/pets" />
        <FadeInView>
          <View style={{ gap: 14 }}>
            <AppText variant="heading">这个家庭无法使用</AppText>
            <AppText muted>
              家庭可能已被删除，或你已经没有添加宠物的权限。请从家庭列表重新选择。
            </AppText>
            <Button label="去家庭" onPress={() => router.replace('/families' as never)} />
          </View>
        </FadeInView>
      </Screen>
    )
  }
  if (rows.length === 0) {
    return (
      <Screen>
        <BackHeader title="添加宠物" subtitle="先有一个家庭，成员才能看到它的照护清单" fallbackHref="/families" />
        <FadeInView>
          <View style={{ gap: 14 }}>
            <AppText variant="heading">先创建一个家庭</AppText>
            <AppText muted>照护记录会归到这只宠物名下；家庭决定谁能查看。</AppText>
            <Button label="去家庭" onPress={() => router.push('/families' as never)} />
          </View>
        </FadeInView>
      </Screen>
    )
  }
  const manageableRows = rows.filter((family) => family.role === 'owner')
  if (manageableRows.length === 0 || (requestedFamilyId && requestedFamily?.role !== 'owner')) {
    return (
      <Screen>
        <BackHeader title="添加宠物" fallbackHref="/families" />
        <FadeInView>
          <View style={{ gap: 14 }}>
            <AppText variant="heading">需要家庭管理员添加</AppText>
            <AppText muted>
              你可以参与现有宠物的照护；新增宠物会改变整个家庭的清单，需要家庭管理员来做。
            </AppText>
            <Button label="回家庭管理" onPress={() => router.replace('/families' as never)} />
          </View>
        </FadeInView>
      </Screen>
    )
  }
  return (
    <CreatePetScreen
      families={manageableRows}
      guided={guided === '1'}
      lockedFamilyId={requestedFamilyId}
      preferredFamilyId={
        requestedFamilyId ??
        preferences.data?.preferences.default_family_id ??
        undefined
      }
    />
  )
}
