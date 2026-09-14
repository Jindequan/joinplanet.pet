import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  View,
} from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { ClockCounterClockwise, Plus } from 'phosphor-react-native'
import { router, useLocalSearchParams } from 'expo-router'
import {
  planetApi,
  type Pet,
  type TimelineEvent,
} from '../../core/api/planet-api'
import { foundationReaders, useFoundationWriters } from '../../core/foundation'
import { queryKeys } from '../../core/query/keys'
import { timelineRecordToast } from '../../core/voice'
import {
  readPendingTimelineEvents,
  subscribePendingTimelineEvents,
} from '../../core/storage/timeline-event-queue'
import { resolvePetTimezone, useScope, type Scope } from '../../core/providers/scope-provider'
import { useTheme } from '../../core/providers/theme-provider'
import { useToast } from '../../core/providers/toast-provider'
import { useSession } from '../../core/providers/session-provider'
import { AppText } from '../../ui/components/app-text'
import { BackHeader } from '../../ui/components/back-header'
import { Button } from '../../ui/components/button'
import { ConfirmDialog } from '../../ui/components/confirm-dialog'
import { EmptyState } from '../../ui/components/empty-state'
import { LoadingState } from '../../ui/components/loading-state'
import { QueryErrorState } from '../../ui/components/query-error-state'
import { QueryRefreshState } from '../../ui/components/query-status'
import { ScopeCascade } from '../../ui/components/scope-cascade'
import { Screen } from '../../ui/components/screen'
import { TabPageHero } from '../../ui/components/tab-page-hero'
import { PressableScale } from '../../ui/motion'
import { EventComposer, EventForm, type EventType } from './composer'
import { EventCard } from './event-card'
import { buildTimelineRows, type TimelineRow } from './list-model'
import { timelineDeleteConsequence, timelineDeleteTitle } from '../../core/presentation/delete-impact'
import { describeEvent } from './registry'
import { formatInTimeZoneSafe } from './time'

type TimelineCursor = { before: string; before_id: string }

export function TimelineScreen({ petId: routePetId = '', familyId: routeFamilyId }: { petId?: string; familyId?: string } = {}) {
  const { theme } = useTheme()
  const { showToast } = useToast()
  const { userId } = useSession()
  const foundationWriters = useFoundationWriters()
  const { scope, setScope } = useScope()
  const {
    compose,
    family_id: queryFamilyId,
    familyId: queryFamilyIdCamel,
  } = useLocalSearchParams<{
    compose?: string
    family_id?: string
    familyId?: string
  }>()
  const requestedFamilyId = routeFamilyId ||
    (typeof queryFamilyId === 'string' ? queryFamilyId : '') ||
    (typeof queryFamilyIdCamel === 'string' ? queryFamilyIdCamel : '')
  const composeTypes: EventType[] = ['note', 'photo', 'symptom', 'weight', 'vet_visit', 'vaccine']
  const composeType: EventType | undefined = composeTypes.includes(compose as EventType)
    ? compose as EventType
    : undefined
  const [composerOpen, setComposerOpen] = useState(Boolean(composeType))
  const [eventToDelete, setEventToDelete] = useState<TimelineEvent | null>(null)
  const [eventToEdit, setEventToEdit] = useState<TimelineEvent | null>(null)
  const [pendingTimelineCount, setPendingTimelineCount] = useState(0)

  useEffect(() => {
    if (!userId) {
      setPendingTimelineCount(0)
      return
    }
    let cancelled = false
    const refreshPending = () => {
      void readPendingTimelineEvents(userId).then((events) => {
        if (!cancelled) setPendingTimelineCount(events.length)
      })
    }
    refreshPending()
    const unsubscribe = subscribePendingTimelineEvents(refreshPending)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [userId])

  useEffect(() => {
    if (!composeType) return
    setComposerOpen(true)
    // `compose` is an entry command, not persistent page state. Consume it
    // after opening so cancel/save followed by refresh does not resurrect an
    // old composer from the browser history.
    router.setParams({ compose: undefined })
  }, [composeType])

  const pets = useQuery({
    queryKey: queryKeys.accessiblePets,
    queryFn: () => foundationReaders.accessiblePets(),
  })
  const families = useQuery({
    queryKey: queryKeys.families,
    queryFn: () => foundationReaders.families(),
  })
  const preferences = useQuery({
    queryKey: queryKeys.preferences,
    queryFn: () => planetApi.me.preferences(),
  })

  const familyList = families.data?.families ?? []
  // The Timeline is the durable Pet history. Archived pets remain visible here
  // in read-only form; hiding them at the collection boundary would make
  // “archive, history preserved” true in the API but false in the main record
  // view. Write affordances are still removed by canWritePet below.
  const allPets = pets.data?.pets ?? []
  const routePet = routePetId ? allPets.find((pet) => pet.id === routePetId) : undefined
  const routeScopeKey = `${routePetId}:${requestedFamilyId}`
  const appliedRouteScopeKey = useRef<string | null>(null)
  const routeFamilyIsLinked = Boolean(
    requestedFamilyId && routePet?.family_ids?.includes(requestedFamilyId),
  )
  useEffect(() => {
    if (!routePetId || !requestedFamilyId || !routePet) {
      if (
        !routePetId &&
        requestedFamilyId &&
        familyList.some((family) => family.id === requestedFamilyId) &&
        appliedRouteScopeKey.current !== routeScopeKey
      ) {
        appliedRouteScopeKey.current = routeScopeKey
        setScope({ type: 'family', id: requestedFamilyId })
      }
      return
    }
    if (appliedRouteScopeKey.current === routeScopeKey) return
    appliedRouteScopeKey.current = routeScopeKey
    if (routeFamilyIsLinked) {
      setScope({ type: 'pet', id: routePetId, familyId: requestedFamilyId })
    }
  }, [familyList, requestedFamilyId, routeFamilyIsLinked, routePet, routePetId, routeScopeKey, setScope])

  const routeContextPending = Boolean(
    (
      (routeFamilyIsLinked && routePetId) ||
      (!routePetId && requestedFamilyId && familyList.some((family) => family.id === requestedFamilyId))
    ) && appliedRouteScopeKey.current !== routeScopeKey,
  )
  const timelineScope: Scope = routeContextPending
    ? routePetId
      ? {
          type: 'pet',
          id: routePetId,
          familyId: requestedFamilyId,
        }
      : { type: 'family', id: requestedFamilyId }
    : routePetId
      ? {
        type: 'pet',
        id: routePetId,
        ...(routeContextPending
          ? { familyId: requestedFamilyId }
          : scope.type === 'pet' && scope.id === routePetId && scope.familyId
          ? { familyId: scope.familyId }
          : scope.type === 'family' && routePet?.family_ids?.includes(scope.id)
            ? { familyId: scope.id }
            : {}),
        }
      : scope
  const lockedToRoutePet = Boolean(routePetId)

  const preferredFamilyId = timelineScope.type === 'pet' && timelineScope.familyId
    ? timelineScope.familyId
    : scope.type === 'family'
      ? scope.id
      : preferences.data?.preferences.default_family_id
  const timezone =
    timelineScope.type === 'family'
      ? familyList.find((family) => family.id === timelineScope.id)?.timezone
      : timelineScope.type === 'pet'
        ? resolvePetTimezone(
            allPets.find((pet) => pet.id === timelineScope.id)?.family_ids,
            familyList,
            preferredFamilyId,
          )
        : undefined

  const listPets =
    timelineScope.type === 'family'
      ? allPets.filter((pet) => (pet.family_ids ?? []).includes(timelineScope.id))
      : timelineScope.type === 'pet'
        ? allPets.filter((pet) => pet.id === timelineScope.id)
        : allPets

  const selectedPet =
    timelineScope.type === 'pet'
      ? allPets.find((pet) => pet.id === timelineScope.id) ??
        pets.data?.pets.find((pet) => pet.id === timelineScope.id)
      : undefined

  const activePetId = timelineScope.type === 'pet' ? timelineScope.id : ''
  const activeFamilyId = timelineScope.type === 'family'
    ? timelineScope.id
    : timelineScope.type === 'pet'
      ? timelineScope.familyId
      : undefined
  const activeFamilyName = activeFamilyId
    ? familyList.find((family) => family.id === activeFamilyId)?.name
    : undefined
  const recordFamilyId = activeFamilyId ?? (
    timelineScope.type === 'pet' && selectedPet?.family_ids?.length === 1
      ? selectedPet.family_ids[0]
      : timelineScope.type === 'pet' &&
          preferredFamilyId &&
          selectedPet?.family_ids?.includes(preferredFamilyId)
        ? preferredFamilyId
        : undefined
  )

  const canWritePet = useCallback((pet: Pet | undefined) => {
    if (!pet || !userId || pet.archived_at) return false
    const familyId = timelineScope.type === 'family'
      ? timelineScope.id
      : timelineScope.type === 'pet'
        ? timelineScope.familyId
        : undefined
    if (familyId) {
      const role = pet.family_roles?.[familyId] ?? familyList.find((family) => family.id === familyId)?.role
      return Boolean(role && role !== 'viewer' && role !== 'read_only')
    }
    const roles = Object.values(pet.family_roles ?? {})
    if (roles.length > 0 && new Set(roles).size > 1) return false
    return Boolean(pet.access_role && pet.access_role !== 'viewer' && pet.access_role !== 'read_only')
  }, [familyList, timelineScope, userId])
  const canWriteFamilyForPet = useCallback((pet: Pet, familyId: string) => {
    const role = pet.family_roles?.[familyId] ?? familyList.find((family) => family.id === familyId)?.role
    return Boolean(role && role !== 'viewer' && role !== 'read_only')
  }, [familyList])
  const canMutateEvent = useCallback((event: TimelineEvent, pet: Pet | undefined) => {
    if (!pet || !userId || pet.archived_at) return false
    // The Pet owner can maintain the durable history regardless of which
    // Family edge produced the event.
    if (pet.current_owner_user_id === userId) return true
    const role = event.family_id
      ? pet.family_roles?.[event.family_id] ?? familyList.find((family) => family.id === event.family_id)?.role
      : timelineScope.type === 'family'
        ? familyList.find((family) => family.id === timelineScope.id)?.role
        : pet.access_role
    if (!role || role === 'viewer' || role === 'read_only') return false
    return event.recorded_by === userId || role === 'owner'
  }, [familyList, timelineScope, userId])

  const query = useInfiniteQuery({
    queryKey: ['timeline', timelineScope] as const,
    initialPageParam: undefined as TimelineCursor | undefined,
    queryFn: ({ pageParam }) =>
      foundationReaders.timeline({
        limit: 50,
        pet_id: timelineScope.type === 'pet' ? timelineScope.id : undefined,
        family_id: timelineScope.type === 'family' ? timelineScope.id : undefined,
        before: pageParam?.before,
        before_id: pageParam?.before_id,
      }),
    getNextPageParam: (page) => page.next_cursor,
  })
  const timelineDependencyError =
    (!pets.data && pets.error) ||
    (!families.data && families.error) ||
    (!preferences.data && preferences.error) ||
    undefined

  async function remove(event: TimelineEvent) {
    await foundationWriters.deleteTimelineEvent(event.id, event.pet_id)
    setEventToDelete(null)
    showToast({ message: '记录已删除' })
  }

  const allEvents = useMemo(() => {
    const flat = query.data?.pages.flatMap((page) => page.events) ?? []
    return flat.filter(
      (event, index, all) => all.findIndex((candidate) => candidate.id === event.id) === index,
    )
  }, [query.data])

  const weightDeltaByEvent = useMemo(() => {
    const lastWeightByPet = new Map<string, number>()
    const deltas = new Map<string, string | null>()
    for (const event of [...allEvents].sort(
      (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
    )) {
      if (event.type !== 'weight') continue
      const grams = event.payload?.weight_g
      if (typeof grams !== 'number') continue
      const previous = lastWeightByPet.get(event.pet_id)
      deltas.set(
        event.id,
        previous !== undefined && grams !== previous
          ? `${grams > previous ? '↗' : '↘'} ${Math.abs((grams - previous) / 1000).toFixed(2)} kg`
          : null,
      )
      lastWeightByPet.set(event.pet_id, grams)
    }
    return deltas
  }, [allEvents])

  const petNameById = useMemo(
    () => new Map((pets.data?.pets ?? []).map((pet) => [pet.id, pet.name])),
    [pets.data],
  )
  const familyNameById = useMemo(
    () => new Map(familyList.map((family) => [family.id, family.name])),
    [familyList],
  )

  const now = new Date()
  const todayKey = formatInTimeZoneSafe(now, timezone, 'yyyy-MM-dd')
  const yesterdayKey = formatInTimeZoneSafe(
    new Date(now.getTime() - 24 * 60 * 60 * 1000),
    timezone,
    'yyyy-MM-dd',
  )

  const rows = useMemo(
    () => buildTimelineRows(allEvents, timezone, todayKey, yesterdayKey),
    [allEvents, timezone, todayKey, yesterdayKey],
  )

  const recordStats = useMemo(() => ({
    total: allEvents.length,
    care: allEvents.filter((event) => event.source?.startsWith('auto:')).length,
    manual: allEvents.filter((event) => event.source === 'user').length,
  }), [allEvents])

  const composerPets: Pet[] =
    timelineScope.type === 'pet'
      ? selectedPet && (
          canWritePet(selectedPet) ||
          (selectedPet.family_ids ?? []).some((familyId) => canWriteFamilyForPet(selectedPet, familyId))
        )
        ? [selectedPet]
        : []
      : listPets.filter((pet) =>
          canWritePet(pet) ||
          (pet.family_ids ?? []).some((familyId) => canWriteFamilyForPet(pet, familyId)),
        )
  const writableFamilyIdsByPet = useMemo(
    () => Object.fromEntries(
      composerPets.map((pet) => [
        pet.id,
        (pet.family_ids ?? []).filter((familyId) => canWriteFamilyForPet(pet, familyId)),
      ]),
    ) as Record<string, string[]>,
    [canWriteFamilyForPet, composerPets],
  )

  const timelineSubtitle =
    allEvents.length > 0
      ? `${allEvents.length} 条记录${lockedToRoutePet && selectedPet ? ` · ${selectedPet.name}` : ''}`
      : '完成照护或添加记录后，会按时间显示在这里'
  const readOnlyScope = listPets.length > 0 && composerPets.length === 0 && listPets.some((pet) => !pet.archived_at)

  const loadMore = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage()
    }
  }, [query])

  const renderItem = useCallback(
    ({ item, index }: { item: TimelineRow; index: number }) => {
      if (item.kind === 'header') {
        const isFirst = index === 0
        return (
          <AppText
            variant="heading"
            style={{ marginTop: isFirst ? 0 : 18, marginBottom: 10 }}
          >
            {item.label}
          </AppText>
        )
      }
      return (
        <View style={styles.eventWrap}>
      <EventCard
        event={item.event}
        petName={petNameById.get(item.event.pet_id)}
        familyName={item.event.family_id ? familyNameById.get(item.event.family_id) : undefined}
        weightDelta={weightDeltaByEvent.get(item.event.id)}
        timezone={timezone}
        onOpenOccurrence={
          item.event.care_occurrence_id
            ? () => {
                const occurrenceFamilyId = item.event.family_id ||
                  (timelineScope.type === 'pet' ? timelineScope.familyId : undefined)
                router.push({
                  pathname: '/(tabs)',
                  params: {
                    focus_date: formatInTimeZoneSafe(item.event.occurred_at, timezone, 'yyyy-MM-dd'),
                    focus_task_id: item.event.care_occurrence_id,
                    ...(occurrenceFamilyId ? { family_id: occurrenceFamilyId } : {}),
                    ...(timelineScope.type === 'pet' ? { pet_id: timelineScope.id } : {}),
                  },
                } as never)
              }
            : undefined
        }
        onEdit={canMutateEvent(item.event, pets.data?.pets.find((pet) => pet.id === item.event.pet_id)) ? () => setEventToEdit(item.event) : undefined}
        onDelete={canMutateEvent(item.event, pets.data?.pets.find((pet) => pet.id === item.event.pet_id)) ? () => setEventToDelete(item.event) : undefined}
      />
        </View>
      )
    },
    [familyNameById, petNameById, pets.data?.pets, timezone, weightDeltaByEvent, canMutateEvent],
  )

  const listHeader = useMemo(
    () => (
      <View style={{ gap: theme.spacing.section, paddingTop: 12 }}>
        {!lockedToRoutePet ? (
          <>
            <TabPageHero
              eyebrow="照护"
              title="记录"
              subtitle={timelineSubtitle}
              trailing={
                composerPets.length > 0 && (recordStats.total > 0 || composerOpen) ? (
                  <Button
                    label={composerOpen ? '收起' : '记一笔'}
                    onPress={() => setComposerOpen((value) => !value)}
                    style={{ paddingHorizontal: 12, minHeight: 44 }}
                  />
                ) : undefined
              }
              menu
            />
            <ScopeCascade
              variant="page"
              style={styles.scopePicker}
              alwaysVisible
              includeArchived
            />
            <AppText variant="caption" muted>
              数据来源 · 家庭成员记录的照护事实与宠物事件
            </AppText>
          </>
        ) : (
          <View style={{ gap: 8 }}>
            <BackHeader
              title={selectedPet?.name ?? '宠物'}
              onBack={() => router.replace(`/pets/${routePetId}${timelineScope.type === 'pet' && timelineScope.familyId ? `?familyId=${encodeURIComponent(timelineScope.familyId)}` : ''}` as never)}
            />
            <TabPageHero
              eyebrow="照护"
              title="记录"
              subtitle={`${timelineSubtitle}${activeFamilyName ? ` · ${activeFamilyName}` : ''}${selectedPet && !canWritePet(selectedPet) ? ' · 只查看' : ''}`}
              menu
            />
          </View>
        )}
        {recordStats.total > 0 ? (
          <TimelineSummary
            total={recordStats.total}
            care={recordStats.care}
            manual={recordStats.manual}
          />
        ) : null}
        {readOnlyScope ? (
          <View
            accessibilityLabel="当前范围只查看"
            style={[styles.readOnlyNotice, { backgroundColor: theme.colors.sageSoft, borderColor: theme.colors.line }]}
          >
            <AppText variant="label" color={theme.colors.forest2}>当前范围只查看</AppText>
            <AppText variant="caption" muted>
              你可以查看全部记录；要添加或修改记录，请切换到可参与照护的家庭或宠物。
            </AppText>
          </View>
        ) : null}
        <QueryRefreshState
          visible={query.isFetching && !query.isLoading && !query.isFetchingNextPage}
          label="正在更新记录"
        />
        {pendingTimelineCount > 0 ? (
          <View
            accessibilityLabel={`${pendingTimelineCount} 条记录等待同步`}
            style={[styles.pendingSync, { backgroundColor: theme.colors.sageSoft, borderColor: theme.colors.line }]}
          >
            <AppText variant="caption" color={theme.colors.forest2}>
              {pendingTimelineCount} 条记录已保存在本机 · 联网后自动同步
            </AppText>
          </View>
        ) : null}
      </View>
    ),
    [lockedToRoutePet, selectedPet?.name, activeFamilyName, theme, recordStats, timelineSubtitle, composerOpen, composerPets.length, readOnlyScope],
  )

  const listFooter = useMemo(() => {
    if (!query.hasNextPage && !query.isFetchingNextPage) return null
    return (
      <View style={styles.footer}>
        {query.isFetchingNextPage ? (
          <View accessibilityRole="progressbar" accessibilityLabel="正在加载更早的记录" style={styles.loadingFooter}>
            <ActivityIndicator color={theme.colors.forest2} />
            <AppText variant="caption" muted>正在加载更早的记录…</AppText>
          </View>
        ) : (
          <Button label="更早的记录" variant="secondary" full onPress={loadMore} />
        )}
      </View>
    )
  }, [loadMore, query.hasNextPage, query.isFetchingNextPage, theme.colors.forest2])

  if (timelineDependencyError) {
    return (
      <Screen inset="tabs">
        <TabPageHero eyebrow="照护" title="记录" subtitle="范围信息加载失败" menu />
        <QueryErrorState
          error={timelineDependencyError}
          message="宠物和家庭范围暂时无法更新，请重试。"
          onRetry={() => {
            void pets.refetch()
            void families.refetch()
            void preferences.refetch()
          }}
        />
      </Screen>
    )
  }

  if (query.isLoading || pets.isLoading || families.isLoading || preferences.isLoading) {
    return (
      <Screen inset="tabs">
        <TabPageHero eyebrow="照护" title="记录" subtitle="正在加载记录" menu />
        <LoadingState label="正在加载记录" />
      </Screen>
    )
  }

  if (lockedToRoutePet && !routePet) {
    return (
      <Screen>
        <BackHeader
          title="记录"
          onBack={() => router.replace(`/pets/${routePetId}${requestedFamilyId ? `?familyId=${encodeURIComponent(requestedFamilyId)}` : ''}` as never)}
        />
        <QueryErrorState
          message="这只宠物不存在，或你已无权查看它的记录。"
          onRetry={() => void pets.refetch()}
        />
      </Screen>
    )
  }

  if (query.error) {
    return (
      <Screen inset="tabs">
        <TabPageHero eyebrow="照护" title="记录" subtitle="加载失败" menu />
        <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />
      </Screen>
    )
  }

  return (
    <View style={styles.root}>
      <Screen scroll={false} contentStyle={styles.listScreen}>
        <FlashList
          data={rows}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          getItemType={(item) => item.kind}
          style={{ flex: 1 }}
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          ListEmptyComponent={
            <EmptyState
              icon={ClockCounterClockwise}
              title="暂无记录"
              description="完成照护、记录体重或症状后，记录会按时间显示在这里。"
              action={
                composerPets.length > 0 ? (
                  <Button label="记一笔" onPress={() => setComposerOpen(true)} />
                ) : undefined
              }
            />
          }
          contentContainerStyle={{
            paddingHorizontal: theme.spacing.page,
            paddingBottom: theme.spacing.bottomClearance,
          }}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          showsVerticalScrollIndicator={false}
        />
      </Screen>

      {composerPets.length > 0 && lockedToRoutePet ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={composerOpen ? '收起' : '记一笔'}
          onPress={() => setComposerOpen((value) => !value)}
          style={[
            styles.fab,
            theme.shadow.floating,
            {
              backgroundColor: theme.colors.forest2,
              borderRadius: theme.radius.pill,
            },
          ]}
        >
          <Plus size={22} color={theme.colors.onBrand} weight="bold" />
          <AppText variant="label" color={theme.colors.onBrand}>
            {composerOpen ? '收起' : '记一笔'}
          </AppText>
        </PressableScale>
      ) : null}

      {composerOpen && composerPets.length > 0 ? (
        <EventComposer
          pets={composerPets}
          userId={userId ?? undefined}
          familyId={activeFamilyId}
          families={familyList}
          defaultFamilyId={recordFamilyId}
          writableFamilyIdsByPet={writableFamilyIdsByPet}
          defaultPetId={activePetId || (composerPets.length === 1 ? composerPets[0]?.id || '' : '')}
          defaultType={composeType}
          onClose={() => {
            setComposerOpen(false)
            if (composeType) router.setParams({ compose: undefined })
          }}
          onSaved={(result) => {
            setComposerOpen(false)
            if (composeType) router.setParams({ compose: undefined })
            showToast({
              message: result?.queued
                ? '记录已保存在本机，联网后自动同步。'
                : timelineRecordToast(),
            })
          }}
        />
      ) : null}

      {eventToEdit && (eventToEdit.pet_id || activePetId) ? (
        <EventForm
          petId={eventToEdit.pet_id || activePetId}
          familyId={eventToEdit.family_id ?? activeFamilyId}
          familyName={eventToEdit.family_id ? familyNameById.get(eventToEdit.family_id) : undefined}
          timezone={eventToEdit.family_id
            ? familyList.find((family) => family.id === eventToEdit.family_id)?.timezone ?? timezone
            : timezone}
          initial={eventToEdit}
          onClose={() => setEventToEdit(null)}
          onSaved={() => {
            setEventToEdit(null)
            showToast({ message: '已更新' })
          }}
        />
      ) : null}

      <ConfirmDialog
        visible={Boolean(eventToDelete)}
        title={
          eventToDelete
            ? timelineDeleteTitle(
                eventToDelete.type,
                describeEvent(eventToDelete.type, eventToDelete.payload).category,
              )
            : '删除记录？'
        }
        consequence={
          eventToDelete ? timelineDeleteConsequence(eventToDelete) : '删除后无法恢复。'
        }
        confirmLabel="删除"
        onCancel={() => setEventToDelete(null)}
        onConfirm={async () => {
          if (!eventToDelete) return
          await remove(eventToDelete)
        }}
      />
    </View>
  )
}

function TimelineSummary({
  total,
  care,
  manual,
}: {
  total: number
  care: number
  manual: number
}) {
  const { theme } = useTheme()
  return (
    <View
      style={[styles.summaryHero, theme.shadow.card, { backgroundColor: theme.colors.paperStrong, borderColor: theme.colors.line, borderRadius: theme.radius.xl }]}
      accessibilityLabel={`记录概览：共 ${total} 条，照护 ${care} 条，手动 ${manual} 条`}
    >
      <View style={styles.summaryHeroTop}>
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="eyebrow" color={theme.colors.forest2}>宠物的生活记录</AppText>
          <AppText variant="title">{total} 条记录</AppText>
          <AppText variant="caption" muted>
            照护完成和临时发生的事，都按时间留在这里
          </AppText>
        </View>
        <Plus size={30} color={theme.colors.forest2} weight="bold" />
      </View>
      <View style={[styles.summaryBreakdown, { borderTopColor: theme.colors.line }]}> 
        <View style={styles.summaryMetric}>
          <AppText variant="heading" color={theme.colors.forest2}>{care}</AppText>
          <AppText variant="caption" muted>照护记录</AppText>
        </View>
        <View style={styles.summaryMetric}>
          <AppText variant="heading" color={theme.colors.forest2}>{manual}</AppText>
          <AppText variant="caption" muted>手动记录</AppText>
        </View>
        <AppText variant="caption" muted style={styles.summaryHint}>
          点击右上角“记一笔”添加事件
        </AppText>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listScreen: {
    flex: 1,
    gap: 0,
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  scopePicker: { marginBottom: 0 },
  summaryHero: {
    overflow: 'hidden',
    paddingTop: 18,
    paddingHorizontal: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  summaryHeroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  summaryBreakdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    marginTop: 16,
    paddingTop: 12,
    paddingBottom: 15,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  summaryMetric: {
    minWidth: 72,
    gap: 1,
  },
  summaryHint: {
    flex: 1,
    textAlign: 'right',
  },
  readOnlyNotice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 11,
    gap: 3,
  },
  pendingSync: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  eventWrap: { marginBottom: 10 },
  footer: { paddingTop: 16, paddingBottom: 8 },
  loadingFooter: { minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 8 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 108,
    minHeight: 52,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 5,
  },
})
