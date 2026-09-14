import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  CaretDown,
  CaretUp,
  CalendarBlank,
  CheckCircle,
  ClockCounterClockwise,
  Plus,
  WarningCircle,
} from 'phosphor-react-native'
import {
  planetApi,
  createIdempotencyKey,
  type Task,
  type TaskLog,
} from '../../core/api/planet-api'
import { errorMessage, isApiError } from '../../core/api/errors'
import {
  foundationReaders,
  invalidateAfterCareAction,
  enqueuePendingCareTask,
  enqueuePendingCareUndo,
  discardPendingCareTasks,
  readPendingCareTasks,
  subscribePendingCareTasks,
  syncPendingCareTaskQueue,
  useFoundationWriters,
  type PendingCareTask,
} from '../../core/foundation'
import { queryKeys } from '../../core/query/keys'
import { useCapabilities } from '../../core/capabilities'
import { useResolvedScope, useScope } from '../../core/providers/scope-provider'
import { useSession } from '../../core/providers/session-provider'
import { useTheme } from '../../core/providers/theme-provider'
import { useToast } from '../../core/providers/toast-provider'
import {
  enqueueCareAction,
  readPendingCareActions,
  subscribeCareActionQueue,
  type PendingCareAction,
} from '../../core/storage/care-action-queue'
import {
  readTodaySnapshot,
  writeTodaySnapshot,
  type TodaySnapshot,
} from '../../core/storage/today-snapshot'
import { useActivation } from '../../core/activation'
import { civilDateInTimezone } from '../../core/time/civil'
import { router, useLocalSearchParams } from 'expo-router'
import { SKIP_COPY } from '../../core/presentation/skip'
import { isCareDone, isCareOpen, isCareResolved, isCareSkipped } from '../../core/presentation/care-status'
import {
  todayCompleteToast,
  todaySkipToast,
  todaySubtitle,
} from '../../core/voice'
import { AppText } from '../../ui/components/app-text'
import { Button } from '../../ui/components/button'
import { EmptyState } from '../../ui/components/empty-state'
import { LoadingState } from '../../ui/components/loading-state'
import { ModalSheet } from '../../ui/components/modal-sheet'
import { OptionSheet } from '../../ui/components/option-sheet'
import { ProgressBar } from '../../ui/components/progress-bar'
import { QueryErrorState } from '../../ui/components/query-error-state'
import { ScopeCascade } from '../../ui/components/scope-cascade'
import { Screen } from '../../ui/components/screen'
import { TabPageHero } from '../../ui/components/tab-page-hero'
import { TextField } from '../../ui/components/text-field'
import { FadeInView, hapticSuccess, PressableScale } from '../../ui/motion'
import { AllDoneCard, FeatureCard, TodayPetOverview, UpcomingRow, isTaskOverdue, type TodayRow } from './cards'
import { SetupJourney } from './setup-journey'
import { CareHandoffComposer } from '../care-requests/batch-panel'
import { ScheduleAdjustment } from './schedule-adjustment'
import { TemporaryCare } from './temporary-care'
import { CareRequestComposer } from '../care-requests/panel'
import { DigestOverview } from '../digest/digest-overview'
import { EventComposer } from '../timeline/composer'
import { instantFromCivilDateTime } from '../timeline/time'
import { earliestViewDate, isDateActionable } from './model/backfill-policy'
import { pickFeaturedItem, rankTodayItems } from './model/rank-tasks'
import {
  skipChoiceForRecurring,
  skipChoiceHint,
  skipChoiceLabel,
  type SkipChoice,
} from './model/skip-flow'

function formatSnapshotTime(value: string) {
  const time = new Date(value)
  if (Number.isNaN(time.getTime())) return '最近一次'
  return time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function TodayScreen() {
  const { theme } = useTheme()
  const { width: viewportWidth } = useWindowDimensions()
  const { showToast } = useToast()
  const { status: sessionStatus, userId: sessionUserId } = useSession()
  const { caps } = useCapabilities()
  const {
    focus_date: focusDateParam,
    focus_task_id: focusTaskIdParam,
    family_id: familyIdParam,
    familyId: familyIdCamelParam,
    pet_id: petIdParam,
    petId: petIdCamelParam,
  } = useLocalSearchParams<{
    focus_date?: string
    focus_task_id?: string
    family_id?: string
    familyId?: string
    pet_id?: string
    petId?: string
  }>()
  const [selectedDate, setSelectedDate] = useState('')
  const [focusedTaskId, setFocusedTaskId] = useState('')
  const { setScope } = useScope()
  const resolvedScope = useResolvedScope({ selectedDate })
  const { scope, ready: scopeReady, todayQuery, civilToday, familyIdForCollaboration } =
    resolvedScope
  const focusDate = typeof focusDateParam === 'string' ? focusDateParam : ''
  const focusTaskId = typeof focusTaskIdParam === 'string' ? focusTaskIdParam : ''
  const routeFamilyId = typeof familyIdParam === 'string'
    ? familyIdParam
    : typeof familyIdCamelParam === 'string' ? familyIdCamelParam : ''
  const routePetId = typeof petIdParam === 'string'
    ? petIdParam
    : typeof petIdCamelParam === 'string' ? petIdCamelParam : ''
  const appliedRouteScope = useRef('')

  useEffect(() => {
    const key = `${routePetId}:${routeFamilyId}`
    if (!scopeReady || !key || appliedRouteScope.current === key) return
    appliedRouteScope.current = key
    if (routePetId) {
      setScope({ type: 'pet', id: routePetId, ...(routeFamilyId ? { familyId: routeFamilyId } : {}) })
    } else if (routeFamilyId) {
      setScope({ type: 'family', id: routeFamilyId })
    }
  }, [routeFamilyId, routePetId, scopeReady, setScope])

  useEffect(() => {
    if (focusDate) setSelectedDate(focusDate === civilToday ? '' : focusDate)
    if (focusTaskId) setFocusedTaskId(focusTaskId)
  }, [civilToday, focusDate, focusTaskId])
  const client = useQueryClient()
  const foundationWriters = useFoundationWriters()

  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => planetApi.me.get(),
    enabled: sessionStatus === 'authenticated',
  })
  const userId = me.data?.user.id ?? sessionUserId ?? 'anonymous'

  const families = useQuery({
    queryKey: queryKeys.families,
    queryFn: () => foundationReaders.families(),
  })
  const pets = useQuery({
    queryKey: queryKeys.accessiblePets,
    queryFn: () => foundationReaders.accessiblePets(),
  })
  const { phase } = useActivation()
  const wideLayout = Platform.OS === 'web' && viewportWidth >= 960

  const activePets = (pets.data?.pets ?? []).filter((pet) => !pet.archived_at)
  function petCanParticipate(pet: (typeof activePets)[number] | undefined, familyId?: string) {
    if (!pet) return false
    if (familyId) {
      const role = pet.family_roles?.[familyId] ?? families.data?.families.find((family) => family.id === familyId)?.role
      return Boolean(role && role !== 'viewer' && role !== 'read_only')
    }
    // In an unscoped view, mixed roles across shared Family edges are
    // intentionally non-actionable: the UI cannot safely infer which
    // household should receive a completion or handoff.
    const roles = Object.values(pet.family_roles ?? {})
    if (roles.length > 0 && new Set(roles).size > 1) return false
    return Boolean(pet.access_role && pet.access_role !== 'viewer' && pet.access_role !== 'read_only')
  }
  const primaryTimezone = resolvedScope.timezone
  const collaborationFamilyIds = useMemo(() => {
    const accessibleFamilyIds = new Set((families.data?.families ?? []).map((family) => family.id))
    if (scope.type === 'family') return accessibleFamilyIds.has(scope.id) ? [scope.id] : []
    if (scope.type === 'pet') {
      return (activePets.find((pet) => pet.id === scope.id)?.family_ids ?? []).filter((id) => accessibleFamilyIds.has(id))
    }
    return Array.from(accessibleFamilyIds)
  }, [activePets, families.data?.families, scope])
  const writableFamilyIdsByPet = useMemo(
    () => Object.fromEntries(
      activePets.map((pet) => [
        pet.id,
        (pet.family_ids ?? []).filter(
          (familyId) => collaborationFamilyIds.includes(familyId) && petCanParticipate(pet, familyId),
        ),
      ]),
    ) as Record<string, string[]>,
    [activePets, collaborationFamilyIds, families.data?.families],
  )
  const familyNameById = useMemo(
    () => new Map((families.data?.families ?? []).map((family) => [family.id, family.name])),
    [families.data?.families],
  )
  const temporaryCarePets = useMemo(() => {
    if (scope.type === 'family') return activePets.filter((pet) => pet.family_ids?.includes(scope.id))
    if (scope.type === 'pet') return activePets.filter((pet) => pet.id === scope.id)
    return activePets
  }, [activePets, scope])

  // Keep the execution card above the fold on phones. Desktop has room for
  // the date strip; mobile opens it on demand from the compact date control.
  const [showDates, setShowDates] = useState(wideLayout)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [taskFilter, setTaskFilter] = useState<'open' | 'all' | 'resolved'>('open')
  const date = selectedDate || civilToday
  // The same Pet can be shared by several Families. Switching only the
  // family edge must reset the civil date and query boundary too; using just
  // pet.id would leave the previous Family's timezone/date in place.
  const scopeKey = scope.type === 'all'
    ? 'all'
    : scope.type === 'family'
      ? `family:${scope.id}`
      : `pet:${scope.id}:${scope.familyId ?? ''}`

  useEffect(() => {
    setSelectedDate('')
    setShowDates(wideLayout)
    setSecondaryToolsOpen(false)
    // A filter belongs to the current Family/Pet scope. Keeping “已处理”
    // while switching to another scope can make a healthy open checklist
    // look empty, which is especially confusing in All → Family → Pet.
    setTaskFilter('open')
    setFocusedTaskId('')
  }, [scopeKey, scope.type, wideLayout])

  const query = useQuery({
    queryKey: queryKeys.today({
      date: selectedDate || 'current',
      familyId: todayQuery.family_id,
      petId: todayQuery.pet_id,
    }),
    queryFn: async () => {
      const today = await foundationReaders.today(todayQuery)
      void writeTodaySnapshot(userId, todayQuery, today)
      return today
    },
    enabled: scopeReady && resolvedScope.ready && !resolvedScope.familySelectionRequired,
    // Today is shared state: another family member can claim or complete an
    // occurrence while this screen stays open in a different tab/device.
    // Window-focus refresh is not enough for two web tabs, so keep the
    // operational list eventually consistent without requiring a manual
    // reload.
    refetchInterval: sessionStatus === 'authenticated' ? 15_000 : false,
  })

  const [skip, setSkip] = useState<Task | null>(null)
  const [adjustTask, setAdjustTask] = useState<Task | null>(null)
  const [careRequestTask, setCareRequestTask] = useState<Task | null>(null)
  const [careRequestReason, setCareRequestReason] = useState<'unavailable' | undefined>()
  const [careRequestFamilyId, setCareRequestFamilyId] = useState('')
  const [eventComposerOpen, setEventComposerOpen] = useState(false)
  const [pendingCareActions, setPendingCareActions] = useState<PendingCareAction[]>([])
  const [pending, setPending] = useState<PendingCareTask[]>([])
  const [todaySnapshot, setTodaySnapshot] = useState<TodaySnapshot | null>(null)
  const [snapshotReady, setSnapshotReady] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null)
  const [optimistic, setOptimistic] = useState<Record<string, 'done' | 'skipped'>>({})
  // Keep secondary tools available without competing with today's checklist.
  const [secondaryToolsOpen, setSecondaryToolsOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSnapshotReady(false)
    void readTodaySnapshot(userId, todayQuery).then((snapshot) => {
      if (cancelled) return
      setTodaySnapshot(snapshot)
      setSnapshotReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [todayQuery.date, todayQuery.family_id, todayQuery.pet_id, userId])

  useEffect(() => {
    if (!query.data) return
    setTodaySnapshot({ savedAt: new Date().toISOString(), today: query.data })
    setSnapshotReady(true)
  }, [query.data])

  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      void readPendingCareTasks(userId).then((list) => {
        if (!cancelled) setPending(list)
      })
    }
    refresh()
    const unsubscribe = subscribePendingCareTasks(refresh)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [userId])

  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      void readPendingCareActions(userId).then((actions) => {
        if (!cancelled) setPendingCareActions(actions)
      })
    }
    refresh()
    const unsubscribe = subscribeCareActionQueue(refresh)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [userId])

  const retryPending = async () => {
    if (retrying || pending.length === 0) return
    setRetrying(true)
    const { remaining, synced, discarded, firstError } = await syncPendingCareTaskQueue(client, userId)
    setPending(remaining)
    setRetrying(false)
    if (remaining.length === 0) {
      showToast({ message: `${synced} 条已同步${discarded > 0 ? `，${discarded} 条已失效` : ''}` })
    } else {
      showToast({ message: `还有 ${remaining.length} 条未同步：${firstError}` })
    }
  }

  const complete = useMutation({
    mutationFn: ({
      task,
      status,
      actionDate,
      note,
      commandId,
    }: {
      task: Task
      status: 'done' | 'skipped'
      actionDate: string
      note: string
      commandId: string
    }) =>
      foundationWriters.completeCare({
        taskId: task.id,
        status,
        date: actionDate,
        note,
        idempotencyKey: commandId,
      }),
    onMutate: (variables) => {
      setOptimistic((current) => ({ ...current, [variables.task.id]: variables.status }))
    },
    onSuccess: (_, variables) => {
      // Keep the resolved occurrence on screen so the fixed done/undo loop is
      // immediate. The default "待处理" filter is useful for scanning, but
      // hiding the row right after a tap would also hide its only undo action.
      setTaskFilter('all')
      if (variables.status === 'done') void hapticSuccess()
      showToast({
        message:
          variables.status === 'done' ? todayCompleteToast() : todaySkipToast(),
      })
    },
    onError: (e, variables) => {
      setOptimistic((current) => {
        if (!(variables.task.id in current)) return current
        const next = { ...current }
        delete next[variables.task.id]
        return next
      })
      if (isApiError(e) && e.status === 0) {
        void enqueuePendingCareTask({
          userId,
          taskId: variables.task.id,
          status: variables.status,
          date: variables.actionDate,
          note: variables.note,
          commandId: variables.commandId,
        })
          .then((next) => {
            // onSettled runs before the durable write resolves. Restore the
            // optimistic state once the command is safely on disk so an
            // offline completion does not visually jump back to unfinished.
            setOptimistic((current) => ({ ...current, [variables.task.id]: variables.status }))
            setPending(next)
            showToast({ message: '已离线保存，联网后自动同步' })
          })
          .catch((saveError) => {
            showToast({ message: `离线操作未能保存：${errorMessage(saveError)}` })
          })
      } else if (isApiError(e) && e.code === 'TASK_LOG_EXISTS') {
        showToast({ message: '成员已经记过了' })
        invalidateAfterCareAction(client)
      } else if (isApiError(e) && /future occurrences/i.test(e.message)) {
        showToast({ message: '还没到执行时间' })
      } else {
        showToast({ message: errorMessage(e) })
        if (isApiError(e) && e.status !== 0) invalidateAfterCareAction(client)
      }
    },
    onSettled: (_, __, variables) => {
      setBusyTaskId((current) => (current === variables.task.id ? null : current))
      setOptimistic((current) => {
        if (!(variables.task.id in current)) return current
        const next = { ...current }
        delete next[variables.task.id]
        return next
      })
    },
  })

  const todayData = query.data ?? todaySnapshot?.today
  const showingOfflineSnapshot = Boolean(!query.data && todaySnapshot?.today && query.error)
  const showingRefreshingSnapshot = Boolean(
    !query.data && todaySnapshot?.today && query.isFetching && !query.error,
  )

  if (resolvedScope.familySelectionRequired) {
    return (
      <Screen inset="tabs">
        <TabPageHero eyebrow="照护" title="今天" subtitle="请先确定家庭范围" />
        <ScopeCascade variant="page" alwaysVisible />
        <View style={styles.familyContextNotice}>
          <AppText variant="heading">这只宠物属于多个家庭</AppText>
          <AppText muted>
            请在上面的范围选择器中先点选家庭，再查看今天的照护。这样日期、负责人和通知都会使用同一个家庭的时区。
          </AppText>
        </View>
      </Screen>
    )
  }

  if (resolvedScope.scopeError) {
    return (
      <Screen inset="tabs">
        <TabPageHero eyebrow="照护" title="今天" subtitle="范围信息加载失败" />
        <QueryErrorState
          error={resolvedScope.scopeError}
          message="家庭和宠物范围暂时无法更新，请重试。"
          onRetry={resolvedScope.retryScope}
        />
      </Screen>
    )
  }

  if (!scopeReady || !resolvedScope.ready || !snapshotReady || (query.isLoading && !todayData)) {
    return (
      <Screen inset="tabs">
        <TabPageHero eyebrow="照护" title="今天" subtitle="正在加载照护清单" />
        <LoadingState label="正在加载今天的照护清单" />
      </Screen>
    )
  }

  if (query.error && !todayData) {
    return (
      <Screen inset="tabs">
        <TabPageHero eyebrow="照护" title="今天" subtitle="加载失败" />
        <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />
      </Screen>
    )
  }

  const allItems: TodayRow[] = (todayData?.pets ?? []).flatMap((group) =>
    group.items.map((item) => {
      const pendingStatus = optimistic[item.task.id]
      const pet = activePets.find((candidate) => candidate.id === group.pet_id)
      const undoPending = pending.some(
        (pendingItem) => pendingItem.action === 'undo' && pendingItem.taskId === item.task.id,
      )
      const taskFamilyId = item.task.family_id
      const taskFamilyInScope =
        taskFamilyId && collaborationFamilyIds.includes(taskFamilyId) ? taskFamilyId : undefined
      const collaborationFamilyId =
        taskFamilyId
          ? taskFamilyInScope
          : (scope.type === 'family' ? scope.id : undefined) ??
            (familyIdForCollaboration && pet?.family_ids?.includes(familyIdForCollaboration)
              ? familyIdForCollaboration
              : undefined) ??
            (pet?.family_ids?.length === 1 ? pet.family_ids[0] : undefined)
      const log =
        item.log ??
        (pendingStatus
          ? ({
              id: `optimistic-${item.task.id}`,
              status: pendingStatus,
            } as TaskLog)
          : null)
      const currentUserMustRespond = Boolean(
        item.care_request &&
          (item.care_request.state === 'sent' || item.care_request.state === 'seen') &&
          item.care_request.target_user_id === userId,
      )
      const pendingCareAction = pendingCareActions.find((action) =>
        action.occurrenceId === item.task.id ||
        action.occurrenceIds?.includes(item.task.id) ||
        (action.requestId && action.requestId === item.care_request?.id),
      )
      const openCareRequest = item.care_request?.state === 'sent' || item.care_request?.state === 'seen'
      const viewOnly = !petCanParticipate(pet, collaborationFamilyId)
      const familyRole = taskFamilyId
        ? pet?.family_roles?.[taskFamilyId] ?? families.data?.families.find((family) => family.id === taskFamilyId)?.role
        : undefined
      const canUndo = Boolean(
        item.log &&
          !pendingStatus &&
          !undoPending &&
          !showingRefreshingSnapshot &&
          !viewOnly &&
          (item.log.done_by === userId ||
            pet?.current_owner_user_id === userId ||
            familyRole === 'owner'),
      )
      return {
        ...item,
        log,
        petName: group.pet_name,
        petSpecies: activePets.find((pet) => pet.id === group.pet_id)?.species,
        familyId: collaborationFamilyId,
        familyName: collaborationFamilyId ? familyNameById.get(collaborationFamilyId) : undefined,
        undoPending,
        canUndo,
        careRequest: item.care_request,
        careRequestPending: pendingCareAction?.kind,
        currentUserId: userId,
        readOnly: viewOnly,
        showCollaboration: Boolean(
          collaborationFamilyId &&
            (families.data?.families.find((family) => family.id === collaborationFamilyId)?.member_count ?? 0) > 1,
        ),
        canExecute:
          !showingRefreshingSnapshot &&
          !undoPending &&
          !viewOnly &&
          !currentUserMustRespond &&
          !openCareRequest &&
          !pendingCareAction &&
          (!item.task.assigned_to_user_id || item.task.assigned_to_user_id === userId),
      }
    }),
  )
  const hasOpenCareRequest = (item: TodayRow) =>
    Boolean(item.careRequestPending) || item.careRequest?.state === 'sent' || item.careRequest?.state === 'seen'
  const canHandoff = (item: TodayRow) => item.canExecute && !hasOpenCareRequest(item)
  const canClaim = (item: TodayRow) =>
    canHandoff(item) &&
    !item.task.assigned_to_user_id &&
    Boolean(item.familyId && familyHasMultipleMembers(item.familyId))
  const canAdjust = (item: TodayRow) =>
    item.canExecute && !hasOpenCareRequest(item) && Boolean(item.task.care_rule_id)
  const taskCivilToday = (task: Task) => civilDateInTimezone(task.timezone, new Date())
  const ranked = rankTodayItems(allItems, {
    civilToday,
    currentUserId: me.data?.user.id,
    // All scope may contain Families in different timezones. Actionability
    // and overdue ranking must follow the occurrence's Family rule snapshot,
    // not the browser's local calendar.
    civilTodayForItem: (item) => taskCivilToday(item.task),
  })
  const items = ranked
  const readOnlyToday = items.length > 0 && items.every((item) => item.readOnly)
  const completed = items.filter(isCareDone).length
  const skipped = items.filter(isCareSkipped).length
  const resolvedCount = completed + skipped
  const remaining = Math.max(items.length - resolvedCount, 0)
  const incomingRequestCount = items.filter((item) =>
    (item.careRequest?.state === 'sent' || item.careRequest?.state === 'seen') &&
    item.careRequest.target_user_id === userId,
  ).length

  // The Today page is an operations surface, not a chronological dump. Keep
  // the full counts in the summary, while letting the user switch the list
  // between work that still needs attention and resolved history.
  const displayedItems = taskFilter === 'open'
    ? items.filter(isCareOpen)
    : taskFilter === 'resolved'
      ? items.filter(isCareResolved)
      : items
  const displayedFeatured = taskFilter === 'resolved' ? null : pickFeaturedItem(displayedItems, focusedTaskId)
  const displayedRest = displayedItems.filter((item) => item.task.id !== displayedFeatured?.task.id)

  const actionDate = (task: Task) => task.due_date || date
  function beyondBackfill(task: Task) {
    const target = actionDate(task)
    return !isDateActionable(target, taskCivilToday(task))
  }

  async function toggle(item: TodayRow) {
    if (busyTaskId === item.task.id) return
    if (beyondBackfill(item.task)) {
      showToast({ message: '只能补记最近 7 天' })
      return
    }
    setBusyTaskId(item.task.id)
    try {
      if (item.log?.id.startsWith('optimistic-')) {
        const result = await discardPendingCareTasks(userId, item.task.id)
        setPending(result.pending)
        if (result.removed) {
          setOptimistic((current) => {
            const next = { ...current }
            delete next[item.task.id]
            return next
          })
          showToast({ message: '已取消这次离线操作' })
        } else {
          // The authenticated shell may have synced it between renders. Let
          // the server result win instead of pretending a local undo exists.
          await client.invalidateQueries({ queryKey: ['today'] })
          showToast({ message: '这次操作正在同步，请稍后再试' })
        }
        setBusyTaskId(null)
        return
      }
      if (item.log && !item.log.id.startsWith('optimistic-')) {
        const commandId = createIdempotencyKey()
        try {
          await foundationWriters.undoCare(item.log.id, commandId)
          showToast({ message: '已移回待完成' })
        } catch (error) {
          if (isApiError(error) && error.status === 0) {
            const next = await enqueuePendingCareUndo({
              userId,
              taskId: item.task.id,
              logId: item.log.id,
              commandId,
            })
            setPending(next)
            showToast({ message: '已离线保存撤销，联网后自动同步' })
          } else {
            throw error
          }
        }
        setBusyTaskId(null)
      } else {
        complete.mutate({
          task: item.task,
          status: 'done',
          actionDate: actionDate(item.task),
          note: '',
          commandId: createIdempotencyKey(),
        })
      }
    } catch (error) {
      showToast({ message: errorMessage(error) })
      setBusyTaskId(null)
    }
  }

  async function claim(item: TodayRow) {
    if (!item.familyId || !canClaim(item) || busyTaskId === item.task.id) return
    if (beyondBackfill(item.task)) {
      showToast({ message: '只能补记最近 7 天' })
      return
    }
    setBusyTaskId(item.task.id)
    const commandId = createIdempotencyKey()
    try {
      await planetApi.careRequests.claim(item.familyId, item.task.id, commandId)
      invalidateAfterCareAction(client)
      void hapticSuccess()
      showToast({ message: '这一次由你负责' })
    } catch (error) {
      if (isApiError(error) && error.status === 0) {
        try {
          await enqueueCareAction({
            userId,
            kind: 'claim',
            familyId: item.familyId,
            occurrenceId: item.task.id,
            commandId,
          })
          showToast({ message: '已离线保存“我来做”，联网后自动同步' })
        } catch (queueError) {
          showToast({ message: `离线操作未能保存：${errorMessage(queueError)}` })
        }
      } else {
        showToast({ message: errorMessage(error) })
      }
    } finally {
      setBusyTaskId((current) => (current === item.task.id ? null : current))
    }
  }

  const clock = new Date()
  const WEEKDAY_CHARS = ['日', '一', '二', '三', '四', '五', '六']
  const weekStrip = Array.from({ length: 7 }, (_, offset) => {
    const parsed = new Date(clock)
    parsed.setDate(parsed.getDate() - (6 - offset))
    const value = civilDateInTimezone(primaryTimezone, parsed)
    return {
      value,
      weekday: WEEKDAY_CHARS[parsed.getDay()],
      label: String(parsed.getDate()),
      actionable: isDateActionable(value, civilToday),
    }
  })

  const EARLIEST_VIEW_DATE = earliestViewDate(civilToday)
  const earliestViewDateObj = new Date(`${EARLIEST_VIEW_DATE}T12:00:00`)
  const todayDateObj = new Date(`${civilToday}T12:00:00`)

  const dateStrip = (
    <FadeInView>
      <View style={styles.weekRow}>
        {weekStrip.map((day) => {
          const selected = date === day.value
          return (
            <Pressable
              key={day.value}
              accessibilityRole="button"
              accessibilityLabel={`周${day.weekday} ${day.label}日：${day.actionable ? '查看照护' : '只能查看'}`}
              accessibilityState={{ selected, disabled: !day.actionable }}
              accessibilityHint={day.actionable ? '查看这一天的照护事项' : '只能补记最近 7 天'}
              onPress={() => {
                if (!day.actionable) {
                  showToast({ message: '只能补记最近 7 天' })
                  return
                }
                setSelectedDate(day.value === civilToday ? '' : day.value)
              }}
              style={[
                styles.dayChip,
                {
                  backgroundColor: selected ? theme.colors.forest2 : theme.colors.paperStrong,
                  borderColor: theme.colors.line,
                  opacity: day.actionable ? 1 : 0.45,
                },
              ]}
            >
              <AppText variant="caption" color={selected ? theme.colors.onBrand : theme.colors.muted}>
                {day.weekday}
              </AppText>
              <AppText variant="label" color={selected ? theme.colors.onBrand : theme.colors.ink}>
                {day.label}
              </AppText>
            </Pressable>
          )
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="选择更早日期"
          accessibilityHint="打开日期选择器"
          onPress={() => setShowDatePicker(true)}
          style={[styles.dayChip, { backgroundColor: theme.colors.paperStrong, borderColor: theme.colors.line }]}
        >
          <AppText variant="caption" muted>更早</AppText>
        </Pressable>
      </View>
    </FadeInView>
  )

  const familyCount = families.data?.families.length ?? 0
  const familyHasMultipleMembers = (familyId: string) =>
    (families.data?.families.find((family) => family.id === familyId)?.member_count ?? 0) > 1
  const familyCanParticipate = (familyId: string) => {
    const role = families.data?.families.find((family) => family.id === familyId)?.role
    return Boolean(role && role !== 'viewer' && role !== 'read_only')
  }
  // Batch handoff is a primary Today operation. Build it once here so the
  // entry can sit beside the work it acts on instead of being buried below
  // the temporary-record and digest sections.
  const handoffSections = date === civilToday
    ? collaborationFamilyIds
        .map((familyId) => ({
          familyId,
          familyName: familyNameById.get(familyId),
          tasks: items
            .filter((item) => familyIdsForTask(item.task).includes(familyId) && canHandoff(item) && isCareOpen(item))
            .map((item) => item.task),
        }))
        .filter((section) =>
          section.tasks.length >= 2 &&
          familyHasMultipleMembers(section.familyId) &&
          familyCanParticipate(section.familyId),
        )
    : []
  const recordFamilyId = scope.type === 'family' ? scope.id : familyIdForCollaboration
  const recordablePets = temporaryCarePets.filter((pet) =>
    (recordFamilyId && petCanParticipate(pet, recordFamilyId)) ||
      (writableFamilyIdsByPet[pet.id]?.length ?? 0) > 0 ||
      ((pet.family_ids?.length ?? 0) === 0 && petCanParticipate(pet)),
  )
  const digestAvailable = caps.digest && scope.type === 'all' && familyCount > 0
  const secondaryToolsAvailable = digestAvailable || recordablePets.length > 0
  const secondaryToolsSubtitle = digestAvailable && recordablePets.length > 0
    ? '临时记录和家庭摘要'
    : digestAvailable
      ? '家庭摘要'
      : '临时记录'
  // Empty-state actions must stay inside the user's current scope. Using the
  // first globally accessible pet sends a Family/Pet-scoped user to the wrong
  // workspace as soon as they have more than one pet.
  const firstPet = temporaryCarePets[0]
  const familyWithoutPets = scope.type === 'family' && temporaryCarePets.length === 0
  const setupFamily = scope.type === 'family'
    ? families.data?.families.find((family) => family.id === scope.id)
    : scope.type === 'pet' && scope.familyId
      ? families.data?.families.find((family) => family.id === scope.familyId)
      : families.data?.families.find((family) => family.role === 'owner')
  const setupCanManagePet = familyCount === 0 || setupFamily?.role === 'owner'
  const setupCanManageCare = Boolean(
    setupFamily?.role === 'owner' ||
      (firstPet?.current_owner_user_id && firstPet.current_owner_user_id === userId),
  )
  const setupIncomplete = phase !== 'ready'
  const viewingHistory = Boolean(selectedDate && selectedDate !== civilToday)
  const scopeLabel = scope.type === 'all'
    ? '全部宠物'
    : scope.type === 'family'
      ? familyNameById.get(scope.id) ?? '家庭'
      : activePets.find((pet) => pet.id === scope.id)?.name ?? '宠物'
  function dateHeading(value: string) {
    const parsed = new Date(`${value}T12:00:00`)
    if (Number.isNaN(parsed.getTime())) return value
    const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][parsed.getDay()]
    return `${parsed.getMonth() + 1}月${parsed.getDate()}日 ${weekday}`
  }

  function subtitle(featuredTask: TodayRow | null) {
    return todaySubtitle(
      remaining,
      resolvedCount,
      items.length,
      featuredTask?.task.title,
    )
  }

  function inspectCareRequest(item: TodayRow) {
    if (!item.careRequest) return
    router.push(`/requests/${item.careRequest.id}` as never)
  }

  function familyIdsForTask(task: Task) {
    if (task.family_id) return collaborationFamilyIds.includes(task.family_id) ? [task.family_id] : []
    if (scope.type === 'family') return collaborationFamilyIds
    const pet = activePets.find((candidate) => candidate.id === task.pet_id)
    const familyIds = pet?.family_ids ?? []
    return collaborationFamilyIds.filter((familyId) => familyIds.includes(familyId))
  }

  function canOpenCareRequest(item: TodayRow) {
    return canHandoff(item) && familyIdsForTask(item.task).some(familyHasMultipleMembers)
  }

  function openCareRequest(task: Task, reason?: 'unavailable', existingRequestId?: string) {
    // Once a member has accepted this occurrence, “给其他人” must continue
    // the same responsibility chain. Creating from the occurrence would
    // leave the accepted record in place and make two current caregivers
    // possible.
    if (existingRequestId) {
      router.push({
        pathname: `/requests/${existingRequestId}`,
        params: { care_action: 'handoff' },
      } as never)
      return
    }
    const familyIds = familyIdsForTask(task)
    setCareRequestTask(task)
    setCareRequestReason(reason)
    setCareRequestFamilyId(familyIds.length === 1 ? familyIds[0] ?? '' : '')
  }

  function openOverviewTask(taskId: string) {
    const target = items.find((item) => item.task.id === taskId && isCareOpen(item))
    if (!target) return
    if (taskFilter === 'resolved') setTaskFilter('open')
    setFocusedTaskId(taskId)
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      requestAnimationFrame(() => {
        document.getElementById(`today-task-${taskId}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      })
    }
  }

  const featured = pickFeaturedItem(items)

  return (
    <Screen inset="tabs">
      <TabPageHero
        eyebrow={selectedDate && selectedDate !== civilToday ? dateHeading(selectedDate) : dateHeading(civilToday)}
        title={selectedDate && selectedDate !== civilToday ? '历史' : '今天'}
        subtitle={subtitle(featured)}
        trailing={wideLayout ? (
          <View style={styles.heroProgress} accessibilityLabel={`已完成 ${completed} 项，共 ${items.length} 项`}>
            <AppText variant="label" color={theme.colors.forest2}>
              {completed}/{items.length} 已完成
            </AppText>
            <ProgressBar
              value={items.length > 0 ? (completed / items.length) * 100 : 0}
              style={styles.heroProgressBar}
            />
          </View>
        ) : undefined}
        menu
      />

      <ScopeCascade variant="page" alwaysVisible />

      <TodayCommandHeader
        scopeLabel={scopeLabel}
        total={items.length}
        remaining={remaining}
        resolvedCount={resolvedCount}
        history={viewingHistory}
        showDates={showDates}
        wide={wideLayout}
        onToggleDates={() => setShowDates((value) => !value)}
        onRecord={() => {
          if (recordablePets.length > 0) {
            setEventComposerOpen(true)
          } else {
            router.push('/pets' as never)
          }
        }}
      />

      {readOnlyToday ? (
        <View
          accessibilityLabel="当前范围只查看"
          style={[styles.readOnlyNotice, { backgroundColor: theme.colors.sageSoft, borderColor: theme.colors.line }]}
        >
          <AppText variant="label" color={theme.colors.forest2}>当前范围只查看</AppText>
          <AppText variant="caption" muted>
            你可以查看每项照护和负责人；完成、撤销和转交需要可参与照护的成员权限。
          </AppText>
        </View>
      ) : null}

      {showDates ? dateStrip : null}

      {incomingRequestCount > 0 ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`${incomingRequestCount} 项照护请求等你回应`}
          onPress={() => {
            setScope({ type: 'all' })
            router.replace('/requests' as never)
          }}
          style={[styles.requestContext, { backgroundColor: theme.colors.coralSoft, borderColor: theme.colors.dangerLine }]}
        >
          <View style={[styles.requestContextIcon, { backgroundColor: theme.colors.paperStrong }]}>
            <Bell size={17} color={theme.colors.coralDark} weight="fill" />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="label" color={theme.colors.coralDark}>
              {incomingRequestCount} 项照护请求等你回应
            </AppText>
            <AppText variant="caption" color={theme.colors.coralDark}>
              去请求中心处理这项分工。
            </AppText>
          </View>
          <AppText variant="caption" color={theme.colors.coralDark}>打开 →</AppText>
        </PressableScale>
      ) : null}

      {wideLayout ? (
        <TodayPetOverview
          items={items}
          onOpen={openOverviewTask}
        />
      ) : null}

      {items.length > 0 ? (
        <View
          accessibilityLabel="照护事项筛选"
          style={[
            styles.taskFilter,
            {
              backgroundColor: theme.colors.paper,
              borderColor: theme.colors.line,
              borderRadius: theme.radius.lg,
            },
          ]}
        >
          {([
            { key: 'open' as const, label: '待处理', count: remaining },
            { key: 'all' as const, label: '全部', count: items.length },
            { key: 'resolved' as const, label: '已处理', count: resolvedCount },
          ]).map((option) => {
            const selected = taskFilter === option.key
            return (
              <PressableScale
                key={option.key}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${option.label}，${option.count} 项`}
                onPress={() => setTaskFilter(option.key)}
                style={[
                  styles.taskFilterOption,
                  {
                    backgroundColor: selected ? theme.colors.forest2 : 'transparent',
                    borderRadius: theme.radius.md,
                  },
                ]}
              >
                <AppText variant="caption" color={selected ? theme.colors.onBrand : theme.colors.muted}>
                  {option.label}
                </AppText>
                <AppText variant="label" color={selected ? theme.colors.onBrand : theme.colors.ink}>
                  {option.count}
                </AppText>
              </PressableScale>
            )
          })}
        </View>
      ) : null}

      {handoffSections.map((section) => (
        <CareHandoffComposer
          key={section.familyId}
          familyId={section.familyId}
          currentUserId={userId}
          familyName={section.familyName}
          tasks={section.tasks}
          canParticipate
        />
      ))}

      {selectedDate && selectedDate !== civilToday ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="回到今天"
          onPress={() => setSelectedDate('')}
          hitSlop={8}
        >
          <AppText variant="caption" color={theme.colors.coralDark}>
            回到今天
          </AppText>
        </PressableScale>
      ) : null}

      {pending.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="重试同步未同步的照护请求"
          onPress={() => void retryPending()}
          style={[styles.syncBar, { backgroundColor: theme.colors.coralSoft }]}
        >
          <WarningCircle size={16} color={theme.colors.coralDark} weight="fill" />
          <AppText variant="caption" color={theme.colors.coralDark} style={{ flex: 1 }}>
            {retrying ? '同步中…' : `${pending.length} 条还没同步 · 点一下`}
          </AppText>
        </Pressable>
      ) : null}

      {showingOfflineSnapshot ? (
        <View style={[styles.offlineBar, { backgroundColor: theme.colors.sageSoft }]}>
          <WarningCircle size={16} color={theme.colors.forest2} weight="fill" />
          <AppText variant="caption" color={theme.colors.forest2} style={{ flex: 1 }}>
            网络暂时不可用 · 显示的是 {todaySnapshot ? formatSnapshotTime(todaySnapshot.savedAt) : '最近一次'} 清单
          </AppText>
        </View>
      ) : null}

      {showingRefreshingSnapshot ? (
        <View
          style={[styles.offlineBar, { backgroundColor: theme.colors.sageSoft }]}
          accessibilityRole="progressbar"
          accessibilityLabel="正在同步最新照护状态"
        >
          <ActivityIndicator size="small" color={theme.colors.forest2} />
          <AppText variant="caption" color={theme.colors.forest2} style={{ flex: 1 }}>
            正在同步最新照护状态，收到结果后才能操作
          </AppText>
        </View>
      ) : null}

      {items.length === 0 ? (
        setupIncomplete && !viewingHistory ? (
          <SetupJourney
            familyCount={familyCount}
            petCount={temporaryCarePets.length}
            firstPetId={firstPet?.id}
            familyId={scope.type === 'family' ? scope.id : scope.type === 'pet' ? scope.familyId : undefined}
            canManagePet={setupCanManagePet}
            canManageCare={setupCanManageCare}
            familyHref={setupFamily ? `/families/${encodeURIComponent(setupFamily.id)}` : '/families'}
          />
        ) : viewingHistory ? (
          <EmptyState
            icon={ClockCounterClockwise}
            title="这一天没有照护记录"
            description="只能补记最近 7 天。选一个有安排的日子，或回到今天。"
            action={<Button label="回到今天" onPress={() => setSelectedDate('')} />}
          />
        ) : (
          <EmptyState
            icon={CalendarBlank}
            title="今天没有照护安排"
            description={
              familyWithoutPets
                ? '这个家庭还没有宠物。先添加一只，才能安排照护。'
                : '没有待办时，去宠物工作区加一条计划，或查看最近几天。'
            }
            action={
              familyWithoutPets ? (
                <Button
                  label="给这个家庭添加宠物"
                  onPress={() =>
                    router.push(`/pets/new?family_id=${encodeURIComponent(scope.id)}` as never)
                  }
                />
              ) : firstPet ? (
                <Button
                  label="去添加照护"
                  onPress={() => router.push(`/pets/${firstPet.id}/care${scope.type === 'family' ? `?familyId=${encodeURIComponent(scope.id)}` : scope.type === 'pet' && scope.familyId ? `?familyId=${encodeURIComponent(scope.familyId)}` : ''}` as never)}
                />
              ) : (
                <Button
                  label="查看宠物"
                  onPress={() => router.push('/pets' as never)}
                />
              )
            }
          />
        )
      ) : displayedItems.length === 0 ? (
        <EmptyState
          icon={CheckCircle}
          title={taskFilter === 'open' ? '今天已经没有待处理事项' : '还没有已处理事项'}
          description={
            taskFilter === 'open'
              ? `今天共 ${resolvedCount} 项，全部已经处理。`
              : '完成或跳过照护事项后，会出现在这里。'
          }
          action={
            taskFilter === 'open' ? (
              <Button label="查看全部" onPress={() => setTaskFilter('all')} />
            ) : (
              <Button label="查看待处理" onPress={() => setTaskFilter('open')} />
            )
          }
        />
      ) : taskFilter === 'all' && remaining === 0 && !items.some((item) => item.canUndo) ? (
        <AllDoneCard completed={completed} skipped={skipped} />
      ) : (
        <View
          style={[
            styles.taskColumns,
            wideLayout ? styles.taskColumnsWide : null,
            wideLayout && displayedRest.length === 0 ? styles.taskColumnsSingleWide : null,
          ]}
        >
            {displayedFeatured ? (
            <View
              style={[
                styles.featureColumn,
                wideLayout ? styles.featureColumnWide : null,
                wideLayout && displayedRest.length === 0 ? styles.featureColumnSingleWide : null,
              ]}
            >
            <FadeInView index={0}>
              <View nativeID={`today-task-${displayedFeatured.task.id}`}>
                <FeatureCard
                  item={displayedFeatured}
                  compact={!wideLayout}
                  focused={focusedTaskId === displayedFeatured.task.id}
                  busy={busyTaskId === displayedFeatured.task.id}
                  overdue={isTaskOverdue(displayedFeatured.task, displayedFeatured.log)}
                  onToggle={() => void toggle(displayedFeatured)}
                  onSkip={() => setSkip(displayedFeatured.task)}
                  onClaim={canClaim(displayedFeatured) ? () => void claim(displayedFeatured) : undefined}
                  onUnavailable={
                    canOpenCareRequest(displayedFeatured)
                      ? () => openCareRequest(
                        displayedFeatured.task,
                        displayedFeatured.careRequest?.state === 'accepted' ? undefined : 'unavailable',
                        displayedFeatured.careRequest?.state === 'accepted' ? displayedFeatured.careRequest.id : undefined,
                      )
                      : undefined
                  }
                  onDelegate={
                    canOpenCareRequest(displayedFeatured)
                      ? () => openCareRequest(
                        displayedFeatured.task,
                        undefined,
                        displayedFeatured.careRequest?.state === 'accepted' ? displayedFeatured.careRequest.id : undefined,
                      )
                      : undefined
                  }
                  onAdjust={canAdjust(displayedFeatured) ? () => setAdjustTask(displayedFeatured.task) : undefined}
                  onInspectRequest={displayedFeatured.careRequest ? () => inspectCareRequest(displayedFeatured) : undefined}
                  canExecute={displayedFeatured.canExecute}
                />
              </View>
            </FadeInView>
            </View>
          ) : null}
          {displayedRest.length > 0 ? (
            <View style={[styles.restColumn, wideLayout ? styles.restColumnWide : null]}>
              <AppText variant="heading">{taskFilter === 'resolved' ? '已处理' : '接下来'}</AppText>
              {displayedRest.map((item, index) => (
                <FadeInView key={item.task.id} index={index + 1}>
                  <View nativeID={`today-task-${item.task.id}`}>
                    <UpcomingRow
                      item={item}
                      focused={focusedTaskId === item.task.id}
                      busy={busyTaskId === item.task.id}
                      onToggle={() => void toggle(item)}
                      onSkip={() => setSkip(item.task)}
                      onClaim={canClaim(item) ? () => void claim(item) : undefined}
                      onUnavailable={
                        canOpenCareRequest(item)
                          ? () => openCareRequest(
                            item.task,
                            item.careRequest?.state === 'accepted' ? undefined : 'unavailable',
                            item.careRequest?.state === 'accepted' ? item.careRequest.id : undefined,
                          )
                          : undefined
                      }
                      onDelegate={
                        canOpenCareRequest(item)
                          ? () => openCareRequest(
                            item.task,
                            undefined,
                            item.careRequest?.state === 'accepted' ? item.careRequest.id : undefined,
                          )
                          : undefined
                      }
                      onAdjust={canAdjust(item) ? () => setAdjustTask(item.task) : undefined}
                      onInspectRequest={item.careRequest ? () => inspectCareRequest(item) : undefined}
                      canExecute={item.canExecute}
                    />
                  </View>
                </FadeInView>
              ))}
            </View>
          ) : null}
        </View>
      )}

      {/* On a phone, execution is the first job of Today. Keep the multi-pet
          overview useful but below the current care card so the primary
          complete / handoff action is visible without an extra scroll. */}
      {!wideLayout ? (
        <TodayPetOverview
          items={items}
          onOpen={openOverviewTask}
        />
      ) : null}

      {secondaryToolsAvailable ? (
        <>
          <PressableScale
            accessibilityRole="button"
            accessibilityState={{ expanded: secondaryToolsOpen }}
            accessibilityLabel={secondaryToolsOpen ? '收起更多照护工具' : '展开更多照护工具'}
            onPress={() => setSecondaryToolsOpen((value) => !value)}
            style={[
              styles.secondaryToolsTrigger,
              { backgroundColor: theme.colors.paper, borderColor: theme.colors.line, borderRadius: theme.radius.lg },
            ]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="label">更多照护工具</AppText>
              <AppText variant="caption" muted>{secondaryToolsSubtitle}</AppText>
            </View>
            {secondaryToolsOpen ? <CaretUp size={19} color={theme.colors.forest2} /> : <CaretDown size={19} color={theme.colors.forest2} />}
          </PressableScale>

          {secondaryToolsOpen ? (
            <>
              {digestAvailable ? (
                <DigestOverview
                  families={families.data?.families ?? []}
                  date={date}
                />
              ) : null}

              {recordablePets.length > 0 ? (
                <View
                  style={[
                    styles.quickRecord,
                    {
                      backgroundColor: theme.colors.paperStrong,
                      borderColor: theme.colors.line,
                      borderRadius: theme.radius.lg,
                    },
                  ]}
                >
                  <View style={{ flex: 1, gap: 3 }}>
                    <AppText variant="label">临时照护</AppText>
                    <AppText variant="caption" muted>
                      只影响这一天，不会改动周期计划。
                    </AppText>
                  </View>
                  <View style={styles.quickAddActions}>
                    <TemporaryCare
                      pets={recordablePets}
                      families={families.data?.families ?? []}
                      date={date}
                      dateLabel={date === civilToday ? '今天的照护' : `${date} 的照护`}
                      defaultPetId={scope.type === 'pet' ? scope.id : recordablePets.length === 1 ? recordablePets[0]?.id : undefined}
                      defaultFamilyId={scope.type === 'family' ? scope.id : familyIdForCollaboration}
                      writableFamilyIdsByPet={writableFamilyIdsByPet}
                      trigger={
                        <Button
                          label="新增临时照护"
                          variant="secondary"
                          style={styles.quickRecordButton}
                        />
                      }
                    />
                  </View>
                </View>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}

      {showDatePicker && Platform.OS !== 'ios' ? (
        <DateTimePicker
          value={new Date(`${date}T12:00:00`)}
          mode="date"
          display="default"
          minimumDate={earliestViewDateObj}
          maximumDate={todayDateObj}
          onChange={(event, next) => {
            setShowDatePicker(false)
            if (event.type === 'dismissed' || !next) return
            const value = civilDateInTimezone(primaryTimezone, next)
            if (!isDateActionable(value, civilToday)) {
              showToast({ message: '只能补记最近 7 天' })
              return
            }
            setSelectedDate(value === civilToday ? '' : value)
          }}
        />
      ) : null}

      {showDatePicker && Platform.OS === 'ios' ? (
        <ModalSheet visible onClose={() => setShowDatePicker(false)}>
          <DateTimePicker
            value={new Date(`${date}T12:00:00`)}
            mode="date"
            display="spinner"
            minimumDate={earliestViewDateObj}
            maximumDate={todayDateObj}
            onChange={(_, next) => {
              if (!next) return
              const value = civilDateInTimezone(primaryTimezone, next)
              if (!isDateActionable(value, civilToday)) {
                showToast({ message: '只能补记最近 7 天' })
                return
              }
              setSelectedDate(value === civilToday ? '' : value)
            }}
          />
          <Button label="完成" onPress={() => setShowDatePicker(false)} full />
        </ModalSheet>
      ) : null}

      {skip ? (
        <SkipDialog
          task={skip}
          onClose={() => setSkip(null)}
          onMarkSkipped={async (note) => {
            if (beyondBackfill(skip)) {
              showToast({ message: '只能补记最近 7 天' })
              return
            }
            try {
              await complete.mutateAsync({
                task: skip,
                status: 'skipped',
                actionDate: actionDate(skip),
                note,
                commandId: createIdempotencyKey(),
              })
            } catch {
              // handled by mutation
            }
            setSkip(null)
          }}
          onCancelOccurrence={
            skip.care_rule_id &&
            (skip.schedule as { kind?: string })?.kind !== 'once'
              ? async (note) => {
                  if (!skip.care_rule_id) return
                  try {
                    await foundationWriters.applyScheduleAction({
                      action: 'skip',
                      scope: 'this',
                      slot: {
                        care_rule_id: skip.care_rule_id,
                        date: actionDate(skip),
                      },
                      payload: { note },
                      idempotencyKey: createIdempotencyKey(),
                      petId: skip.pet_id,
                    })
                    showToast({ message: '已从今天清单移除' })
                    invalidateAfterCareAction(client)
                  } catch (e) {
                    showToast({ message: errorMessage(e) })
                  }
                  setSkip(null)
                }
              : undefined
          }
        />
      ) : null}

      {adjustTask ? (
        <ScheduleAdjustment
          task={adjustTask}
          date={actionDate(adjustTask)}
          onClose={() => setAdjustTask(null)}
        />
      ) : null}

      <CareRequestComposer
        mode={
          careRequestTask && careRequestFamilyId
            ? {
                kind: 'create',
                familyId: careRequestFamilyId,
                task: careRequestTask,
                currentUserId: userId,
                petName: activePets.find((pet) => pet.id === careRequestTask.pet_id)?.name,
                familyName: familyNameById.get(careRequestFamilyId),
                ...(careRequestReason ? { reason: careRequestReason } : {}),
              }
            : null
        }
        onClose={() => {
          setCareRequestTask(null)
          setCareRequestReason(undefined)
          setCareRequestFamilyId('')
        }}
      />
      {eventComposerOpen && recordablePets.length > 0 ? (
        <EventComposer
          pets={recordablePets}
          userId={userId === 'anonymous' ? undefined : userId}
          familyId={scope.type === 'family' ? scope.id : scope.type === 'pet' ? scope.familyId : undefined}
          families={families.data?.families ?? []}
          defaultFamilyId={recordFamilyId}
          writableFamilyIdsByPet={writableFamilyIdsByPet}
          defaultPetId={scope.type === 'pet' ? scope.id : recordablePets.length === 1 ? recordablePets[0]?.id ?? '' : ''}
          defaultOccurredAt={date === civilToday ? undefined : instantFromCivilDateTime(`${date}T12:00`, primaryTimezone)}
          occurredAtLabel={date === civilToday ? undefined : `记录日期 · ${date}`}
          onSaved={(result) => {
            setEventComposerOpen(false)
            showToast({
              message: result?.queued
                ? '记录已保存在本机，联网后自动同步。'
                : '记录已保存，成员现在都能看到。',
            })
          }}
          onClose={() => setEventComposerOpen(false)}
        />
      ) : null}
      <OptionSheet
        visible={Boolean(careRequestTask && !careRequestFamilyId && familyIdsForTask(careRequestTask).length > 1)}
        title="这件事按哪个家庭安排？"
        options={(careRequestTask ? familyIdsForTask(careRequestTask) : []).map((familyId) => ({
          value: familyId,
          label: familyNameById.get(familyId) ?? '家庭',
        }))}
        selected={careRequestFamilyId}
        onClose={() => {
          setCareRequestTask(null)
          setCareRequestFamilyId('')
        }}
        onSelect={setCareRequestFamilyId}
      />
    </Screen>
  )
}

function TodayCommandHeader({
  scopeLabel,
  total,
  remaining,
  resolvedCount,
  history,
  showDates,
  wide,
  onToggleDates,
  onRecord,
}: {
  scopeLabel: string
  total: number
  remaining: number
  resolvedCount: number
  history: boolean
  showDates: boolean
  wide: boolean
  onToggleDates: () => void
  onRecord: () => void
}) {
  const { theme } = useTheme()
  const progress = (total > 0 ? `${Math.round((resolvedCount / total) * 100)}%` : '0%') as `${number}%`
  const headline = history
    ? `${resolvedCount} 项历史记录`
    : total === 0
      ? '今天还没有安排'
      : remaining > 0
        ? `还有 ${remaining} 项要处理`
        : '今天已经处理完'

  return (
    <View
      style={[
        styles.commandHeader,
        wide ? styles.commandHeaderWide : null,
        {
          backgroundColor: theme.colors.forest2,
          borderColor: theme.colors.forest2,
          borderRadius: theme.radius.xl,
        },
      ]}
    >
      <View style={styles.commandTop}>
        <View style={styles.commandCopy}>
          <AppText variant="eyebrow" color={theme.colors.mint}>
            {history ? '照护记录' : '今天的照护'}
          </AppText>
          <AppText variant="title" color={theme.colors.onBrand} numberOfLines={2}>
            {headline}
          </AppText>
          <AppText variant="caption" color={theme.colors.onBrandMuted} numberOfLines={1}>
            {scopeLabel} · {resolvedCount}/{total} 项已处理
          </AppText>
          <View
            accessible
            accessibilityLabel={`今日进度 ${progress}`}
            style={[styles.commandProgressTrack, { backgroundColor: theme.colors.onBrandSoft }]}
          >
            <View style={[styles.commandProgressFill, { width: progress, backgroundColor: theme.colors.mint }]} />
          </View>
        </View>
        <View style={[styles.commandProgressBadge, { backgroundColor: theme.colors.mint, borderColor: theme.colors.mint }]}> 
          {remaining === 0 && total > 0 ? (
            <CheckCircle size={22} color={theme.colors.forest2} weight="fill" />
          ) : null}
          <AppText variant="title" color={theme.colors.forest2}>
            {progress}
          </AppText>
        </View>
      </View>

      <View style={[styles.commandActions, wide ? styles.commandActionsWide : null, { borderTopColor: theme.colors.onBrandSoft }]}> 
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="记录一件刚发生的事"
          onPress={onRecord}
          style={[styles.commandAction, { backgroundColor: theme.colors.onBrandSoft, borderColor: theme.colors.onBrandLine }]}
        >
          <Plus size={18} color={theme.colors.onBrand} weight="bold" />
          <AppText variant="label" color={theme.colors.onBrand}>记一笔</AppText>
        </PressableScale>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={showDates ? '收起日期选择' : '展开日期选择'}
          onPress={onToggleDates}
          style={[styles.commandAction, styles.commandDateAction, { backgroundColor: theme.colors.onBrandSoft, borderColor: theme.colors.onBrandLine }]}
        >
          <CalendarBlank size={17} color={theme.colors.onBrand} weight="bold" />
          <AppText variant="caption" color={theme.colors.onBrand}>
            {showDates ? '收起日期' : '选日期'}
          </AppText>
        </PressableScale>
      </View>
    </View>
  )
}

function SkipDialog({
  task,
  onClose,
  onMarkSkipped,
  onCancelOccurrence,
}: {
  task: Task
  onClose: () => void
  onMarkSkipped: (note: string) => Promise<void>
  onCancelOccurrence?: (note: string) => Promise<void>
}) {
  const recurring = Boolean(
    task.care_rule_id && (task.schedule as { kind?: string })?.kind !== 'once',
  )
  const choices = skipChoiceForRecurring(recurring)
  const [step, setStep] = useState<'choose' | 'note'>('choose')
  const [choice, setChoice] = useState<SkipChoice | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!choice) return
    setBusy(true)
    try {
      if (choice === 'cancel_occurrence' && onCancelOccurrence) {
        await onCancelOccurrence(note)
      } else {
        await onMarkSkipped(note)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalSheet visible onClose={onClose} busy={busy}>
      <AppText variant="heading">{SKIP_COPY.sheetTitle(task.title)}</AppText>
      {step === 'choose' ? (
        <>
          <AppText muted style={{ marginBottom: 8 }}>
            {SKIP_COPY.step1Prompt}
          </AppText>
          <View style={{ gap: 8 }}>
            {choices.map((item) => (
              <Button
                key={item}
                label={skipChoiceLabel(item)}
                variant="secondary"
                onPress={() => {
                  setChoice(item)
                  setStep('note')
                }}
              />
            ))}
            <Button label={SKIP_COPY.cancel} variant="ghost" onPress={onClose} />
          </View>
          {choices.length > 1 ? (
            <AppText variant="caption" muted style={{ marginTop: 8 }}>
              {choices.map((item) => `${skipChoiceLabel(item)}：${skipChoiceHint(item)}`).join('\n')}
            </AppText>
          ) : (
            <AppText variant="caption" muted style={{ marginTop: 8 }}>
              {skipChoiceHint('mark_skipped')}
            </AppText>
          )}
        </>
      ) : (
        <>
          <AppText muted style={{ marginBottom: 8 }}>
            {choice ? skipChoiceHint(choice) : ''}
          </AppText>
          <TextField
            label={SKIP_COPY.noteLabel}
            value={note}
            onChangeText={setNote}
            maxLength={500}
            editable={!busy}
          />
          <View style={styles.dialogActions}>
            <Button
              label="上一步"
              variant="secondary"
              onPress={() => setStep('choose')}
              disabled={busy}
              style={{ flex: 1 }}
            />
            <Button
              label="标记为跳过"
              busy={busy}
              style={{ flex: 1 }}
              onPress={() => void submit()}
            />
          </View>
        </>
      )}
    </ModalSheet>
  )
}

const styles = StyleSheet.create({
  commandHeader: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  commandHeaderWide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  commandTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  commandCopy: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  commandProgressTrack: {
    height: 6,
    width: '100%',
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 4,
  },
  commandProgressFill: {
    height: '100%',
    borderRadius: 999,
  },
  commandProgressBadge: {
    minWidth: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  commandActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    paddingBottom: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  commandActionsWide: {
    width: 244,
    flexWrap: 'nowrap',
    marginTop: 0,
    paddingTop: 0,
    paddingBottom: 0,
    borderTopWidth: 0,
  },
  commandAction: {
    minHeight: 44,
    flexGrow: 1,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  commandDateAction: {
    minHeight: 44,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueSummary: {
    minHeight: 76,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroProgress: {
    alignItems: 'flex-end',
    gap: 7,
    paddingTop: 8,
  },
  heroProgressBar: {
    width: 118,
    height: 6,
  },
  queueMetric: {
    minWidth: 62,
    gap: 2,
  },
  queueDivider: {
    width: StyleSheet.hairlineWidth,
    height: 36,
  },
  queueScope: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  queueDateButton: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskFilter: {
    flexDirection: 'row',
    gap: 6,
    padding: 5,
    borderWidth: StyleSheet.hairlineWidth,
  },
  taskFilterOption: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  dateBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dayChip: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  syncBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  offlineBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  readOnlyNotice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 11,
    gap: 3,
  },
  requestContext: {
    minHeight: 64,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  requestContextIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  familyContextNotice: {
    gap: 8,
    padding: 18,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(32,48,40,0.12)',
    backgroundColor: '#fffefb',
  },
  dialogActions: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryToolsTrigger: {
    minHeight: 58,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quickRecord: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  quickAddActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickRecordButton: {
    paddingHorizontal: 14,
  },
  taskColumns: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 18,
  },
  featureColumn: {
    width: '100%',
  },
  restColumn: {
    width: '100%',
    gap: 10,
  },
  taskColumnsWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  taskColumnsSingleWide: {
    justifyContent: 'flex-start',
  },
  featureColumnWide: {
    width: '58%',
  },
  featureColumnSingleWide: {
    width: '100%',
  },
  restColumnWide: {
    width: '42%',
  },
})
