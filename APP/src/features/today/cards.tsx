import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient'
import {
  ArrowCounterClockwise,
  CaretRight,
  Check,
  Clock,
  Confetti,
  Users,
  WarningCircle,
} from 'phosphor-react-native'
import type { Task, TaskLog, TodayCareRequestSummary } from '../../core/api/planet-api'
import { todayAssignee, todayResolvedLine } from '../../core/voice'
import { useTheme } from '../../core/providers/theme-provider'
import { AppText } from '../../ui/components/app-text'
import { PetAvatar } from '../../ui/components/pet-avatar'
import { FadeInView, PressableScale } from '../../ui/motion'
import type { PendingCareActionKind } from '../../core/storage/care-action-queue'
import { CARE_ACTION_LABELS } from '../../core/presentation/terminology'
import { isCareDone, isCareOpen, isCareSkipped } from '../../core/presentation/care-status'
import { careRequestCompactCopy, careRequestRouteCopy } from '../care-requests/copy'

export type TodayRow = {
  task: Task
  log: TaskLog | null
  petName: string
  petSpecies?: string
  familyId?: string
  familyName?: string
  undoPending?: boolean
  canUndo?: boolean
  careRequest?: TodayCareRequestSummary | null
  careRequestPending?: PendingCareActionKind
  currentUserId?: string
  readOnly?: boolean
  /** Show the fixed collaboration strip for every actionable occurrence in a multi-member family. */
  showCollaboration?: boolean
  canExecute: boolean
}

export function isTaskOverdue(task: Task, log?: TaskLog | null) {
  if (log || task.status === 'completed' || task.status === 'skipped') return false
  if (task.status === 'missed') return true
  return Boolean(task.due_at && new Date(task.due_at).getTime() < Date.now())
}

function careRequestLine(request: TodayCareRequestSummary, currentUserId?: string) {
  return careRequestCompactCopy(request, currentUserId)
}

function assigneeDisplay(item: TodayRow) {
  if (
    item.task.assigned_to_user_id &&
    item.currentUserId &&
    item.task.assigned_to_user_id === item.currentUserId
  ) {
    return '你'
  }
  return item.task.assigned_to_name
}

function responsibilityLine(item: TodayRow) {
  if (item.undoPending) return '撤销已保存 · 联网后同步'
  if (item.careRequestPending) {
    if (item.careRequestPending === 'create' || item.careRequestPending === 'handoff' || item.careRequestPending === 'batch-create') {
      return '正在通知其他人 · 联网后发送'
    }
    if (item.careRequestPending === 'claim') {
      return `正在确认“${CARE_ACTION_LABELS.accept}” · 联网后同步`
    }
    if (item.careRequestPending === 'accept' || item.careRequestPending === 'batch-accept') {
      return '正在回应 · 联网后同步'
    }
    if (item.careRequestPending === 'decline' || item.careRequestPending === 'batch-decline') {
      return `已保存“${CARE_ACTION_LABELS.decline}” · 联网后继续安排`
    }
    return '正在继续转交 · 联网后发送'
  }
  if (item.careRequest) return careRequestLine(item.careRequest, item.currentUserId)
  const assignee = assigneeDisplay(item)
  if (item.readOnly) {
    return assignee ? `只查看 · 负责人 · ${assignee}` : '只查看 · 还没人负责'
  }
  if (assignee) return `负责人 · ${assignee}`
  if (item.task.status === 'missed') return '已逾期 · 暂无人负责'
  return todayAssignee(undefined, undefined)
}

function handoffActionLabel() {
  return CARE_ACTION_LABELS.delegate
}

function collaborationStatusLine(item: TodayRow) {
  if (item.careRequest || item.readOnly) return responsibilityLine(item)
  if (item.task.assigned_to_user_id === item.currentUserId) return '你负责这一次'
  if (assigneeDisplay(item)) return `由 ${assigneeDisplay(item)} 负责`
  return '还没人负责'
}

function responsibilityTone(request: TodayCareRequestSummary, currentUserId: string | undefined, theme: ReturnType<typeof useTheme>['theme']) {
  if ((request.state === 'sent' || request.state === 'seen') && request.target_user_id === currentUserId) {
    return { backgroundColor: theme.colors.coralSoft, color: theme.colors.coralDark }
  }
  if (request.state === 'accepted') {
    return { backgroundColor: theme.colors.sageSoft, color: theme.colors.forest2 }
  }
  return { backgroundColor: theme.colors.paper, color: theme.colors.forest2 }
}

function ResponsibilityBadge({ item, onPress }: { item: TodayRow; onPress?: () => void }) {
  const { theme } = useTheme()
  if (!item.careRequest) return null
  const tone = responsibilityTone(item.careRequest, item.currentUserId, theme)
  const content = (
    <View
      style={[
        styles.responsibilityBadge,
        {
          backgroundColor: tone.backgroundColor,
          borderColor: onPress ? `${tone.color}55` : 'transparent',
        },
      ]}
    >
      <Users size={14} color={tone.color} weight="bold" />
      <View style={styles.responsibilityCopy}>
        <AppText variant="caption" color={tone.color} numberOfLines={1}>
          {responsibilityLine(item)}
        </AppText>
        <AppText variant="caption" color={tone.color} soft numberOfLines={1}>
          {careRequestRouteCopy(item.careRequest, item.currentUserId)}
        </AppText>
      </View>
      {onPress ? (
        <View style={styles.responsibilityOpen}>
          <AppText variant="caption" color={tone.color}>查看请求</AppText>
          <CaretRight size={14} color={tone.color} weight="bold" />
        </View>
      ) : null}
    </View>
  )
  if (!onPress) return content
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.task.title} 的安排记录`}
      style={styles.responsibilityPressable}
    >
      {content}
    </PressableScale>
  )
}

function CollaborationBar({
  item,
  onClaim,
  onUnavailable,
  onDelegate,
  onInspectRequest,
  busy = false,
  compact = false,
}: {
  item: TodayRow
  onClaim?: () => void
  onUnavailable?: () => void
  onDelegate?: () => void
  onInspectRequest?: () => void
  busy?: boolean
  compact?: boolean
}) {
  const { theme } = useTheme()
  const [secondaryOpen, setSecondaryOpen] = React.useState(false)
  const hasAction = Boolean(onClaim || onUnavailable || onDelegate)
  return (
    <View
      style={[
        compact ? styles.rowCollaboration : styles.collaborationBar,
        { borderTopColor: theme.colors.line, opacity: busy ? 0.5 : 1 },
      ]}
    >
      <View style={compact ? styles.rowCollaborationStatus : styles.collaborationStatusLine}>
        <Users size={14} color={theme.colors.forest2} weight="bold" />
        <AppText variant="caption" color={theme.colors.forest2} numberOfLines={1}>
          {collaborationStatusLine(item)}
        </AppText>
      </View>
      {hasAction ? (
        <View style={compact ? styles.rowCollaborationActions : styles.collaborationActions}>
          {onClaim ? (
            <PressableScale
              onPress={onClaim}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`${CARE_ACTION_LABELS.accept}：${item.task.title}`}
              accessibilityState={{ disabled: busy, busy }}
              style={[
                compact ? styles.rowCollaborationAction : styles.collaborationAction,
                { borderColor: theme.colors.forest2 },
              ]}
            >
              <AppText variant={compact ? 'caption' : 'label'} color={theme.colors.forest2}>
                {CARE_ACTION_LABELS.accept}
              </AppText>
            </PressableScale>
          ) : null}
          {onUnavailable && (secondaryOpen || !onClaim) ? (
            <PressableScale
              onPress={onUnavailable}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`${CARE_ACTION_LABELS.decline}：${item.task.title}`}
              accessibilityState={{ disabled: busy, busy }}
              style={[
                compact ? styles.rowCollaborationAction : styles.collaborationAction,
                { borderColor: theme.colors.lineStrong },
              ]}
            >
              <AppText variant={compact ? 'caption' : 'label'} color={theme.colors.forest2}>
                {CARE_ACTION_LABELS.decline}
              </AppText>
            </PressableScale>
          ) : null}
          {onDelegate && (secondaryOpen || !onClaim) ? (
            <PressableScale
              onPress={onDelegate}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`${handoffActionLabel()}：${item.task.title}`}
              accessibilityState={{ disabled: busy, busy }}
              style={[
                compact ? styles.rowCollaborationAction : styles.collaborationAction,
                { borderColor: theme.colors.lineStrong },
              ]}
            >
              <UsersIcon color={theme.colors.forest2} />
              <AppText variant={compact ? 'caption' : 'label'} color={theme.colors.forest2}>
                {handoffActionLabel()}
              </AppText>
              </PressableScale>
            ) : null}
          {onClaim && (onUnavailable || onDelegate) ? (
            <PressableScale
              onPress={() => setSecondaryOpen((value) => !value)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityState={{ expanded: secondaryOpen }}
              accessibilityLabel={secondaryOpen ? '收起其他安排方式' : '展开其他安排方式'}
              style={[
                compact ? styles.rowCollaborationMore : styles.collaborationMore,
                { borderColor: theme.colors.lineStrong, opacity: busy ? 0.5 : 1 },
              ]}
            >
              <AppText variant={compact ? 'caption' : 'label'} color={theme.colors.forest2}>
                {secondaryOpen ? '收起' : '更多'}
              </AppText>
            </PressableScale>
          ) : null}
        </View>
      ) : (
        <View style={styles.collaborationStatus}>
          {onInspectRequest ? (
            <PressableScale
              onPress={onInspectRequest}
              accessibilityRole="button"
              accessibilityLabel={`${item.task.title} 的安排记录`}
              style={styles.collaborationInspect}
            >
              <AppText variant="caption" color={theme.colors.forest2}>查看安排</AppText>
              <CaretRight size={14} color={theme.colors.forest2} weight="bold" />
            </PressableScale>
          ) : null}
        </View>
      )}
    </View>
  )
}

function logStatus(log: TaskLog) {
  return todayResolvedLine(
    log.done_by_name,
    log.status === 'skipped' ? 'skipped' : 'done',
  )
}

export function FeatureCard({
  item,
  compact = false,
  focused,
  busy,
  overdue,
  onToggle,
  onSkip,
  onClaim,
  onUnavailable,
  onDelegate,
  onAdjust,
  onInspectRequest,
  canExecute,
}: {
  item: TodayRow
  compact?: boolean
  focused?: boolean
  busy: boolean
  overdue: boolean
  onToggle: () => void
  onSkip: () => void
  onClaim?: () => void
  onUnavailable?: () => void
  onDelegate?: () => void
  onAdjust?: () => void
  onInspectRequest?: () => void
  canExecute: boolean
}) {
  const { theme } = useTheme()
  const { task, log } = item

  return (
    <View
      style={[
        styles.feature,
        theme.shadow.card,
        {
          backgroundColor: theme.colors.paperStrong,
          borderRadius: theme.radius.xl,
          borderColor: theme.colors.line,
        },
        focused && { borderColor: theme.colors.forest2, borderWidth: 2 },
      ]}
    >
      <View
        style={[
          styles.featureHero,
          compact ? styles.featureHeroCompact : null,
          {
            backgroundColor: theme.colors.paper,
            borderBottomColor: theme.colors.line,
            borderTopLeftRadius: theme.radius.xl,
            borderTopRightRadius: theme.radius.xl,
          },
        ]}
      >
        <View style={[styles.featureMarker, { backgroundColor: theme.colors.coralDark }]} />
        <View style={styles.featureHeroCopy}>
          <View style={styles.featureEyebrowRow}>
            <AppText variant="eyebrow" color={theme.colors.forest2} numberOfLines={1}>
              现在要做
            </AppText>
            {overdue && !log ? (
              <View style={[styles.overdue, { backgroundColor: theme.colors.coralSoft }]}>
                <WarningCircle size={13} color={theme.colors.coralDark} weight="fill" />
                <AppText variant="caption" color={theme.colors.coralDark}>
                  已逾期
                </AppText>
              </View>
            ) : null}
          </View>
          <AppText variant="title" numberOfLines={2}>
            {task.title}
          </AppText>
          <AppText variant="caption" color={theme.colors.forest2} numberOfLines={1}>
            {[item.familyName, item.petName].filter(Boolean).join(' · ')}
          </AppText>
          <View style={styles.featureTime}>
            <Clock size={13} color={theme.colors.soft} weight="bold" />
            <AppText variant="caption" muted>
              {task.time_of_day ? task.time_of_day : '时间未定'}
            </AppText>
          </View>
        </View>
        <PetAvatar petId={task.pet_id} species={item.petSpecies} size={compact ? 56 : 68} decorative />
      </View>

      <View style={[styles.featureBody, compact ? styles.featureBodyCompact : null]}>
        {task.description ? (
          <AppText muted numberOfLines={3}>
            {task.description}
          </AppText>
        ) : null}

        {!log && item.careRequest && canExecute && !item.showCollaboration ? <ResponsibilityBadge item={item} onPress={onInspectRequest} /> : null}
        {!log && !item.careRequest && canExecute ? (
          <AppText variant="caption" muted>{responsibilityLine(item)}</AppText>
        ) : null}

        {log ? (
          <View style={styles.resolvedRow}>
            <AppText variant="label" color={theme.colors.forest2}>
              {item.undoPending ? '撤销已保存 · 联网后同步' : logStatus(log)}
            </AppText>
            {item.canUndo ? (
              <Pressable
                disabled={busy || item.undoPending}
                onPress={onToggle}
                accessibilityRole="button"
                accessibilityLabel="撤销完成"
                accessibilityState={{ disabled: busy || item.undoPending, busy }}
                style={[
                  styles.undoBtn,
                  { backgroundColor: theme.colors.sageSoft, opacity: busy ? 0.6 : 1 },
                ]}
              >
                <ArrowCounterClockwise size={15} color={theme.colors.forest2} weight="bold" />
                <AppText variant="caption" color={theme.colors.forest2}>
                  撤销
                </AppText>
              </Pressable>
            ) : null}
          </View>
        ) : canExecute ? (
          <>
          <View style={styles.featureActions}>
            <PressableScale
              disabled={busy}
              onPress={onToggle}
              accessibilityRole="button"
              accessibilityLabel={`完成 ${task.title}`}
              accessibilityState={{ disabled: busy, busy }}
              style={[
                styles.completeBtn,
                {
                  backgroundColor: theme.colors.forest2,
                  borderRadius: theme.radius.pill,
                  opacity: busy ? theme.motion.disabledOpacity : 1,
                },
              ]}
            >
              {busy ? (
                <ActivityIndicator color={theme.colors.onBrand} />
              ) : (
                <>
                  <Check size={22} color={theme.colors.onBrand} weight="bold" />
                  <AppText variant="label" color={theme.colors.onBrand}>
                    完成
                  </AppText>
                </>
              )}
            </PressableScale>
            <Pressable
              disabled={busy}
              onPress={onSkip}
              accessibilityRole="button"
              accessibilityLabel={`跳过 ${task.title}`}
              accessibilityState={{ disabled: busy, busy }}
              style={({ pressed }) => [
                styles.skipBtn,
                {
                  backgroundColor: theme.colors.sageSoft,
                  borderRadius: theme.radius.pill,
                  opacity: busy ? theme.motion.disabledOpacity : pressed ? theme.motion.pressOpacity : 1,
                },
              ]}
            >
              <AppText variant="label" color={theme.colors.forest2}>
                跳过
              </AppText>
            </Pressable>
          </View>
          {onAdjust ? (
            <PressableScale
              disabled={busy}
              onPress={onAdjust}
              accessibilityRole="button"
              accessibilityLabel={`调整 ${task.title}`}
              accessibilityState={{ disabled: busy, busy }}
              style={[styles.adjustBtn, { opacity: busy ? 0.5 : 1 }]}
            >
              <AppText variant="caption" color={theme.colors.forest2}>
                调整这一次
              </AppText>
            </PressableScale>
          ) : null}
          </>
        ) : item.careRequest && !item.showCollaboration ? (
          <ResponsibilityBadge item={item} onPress={onInspectRequest} />
        ) : item.showCollaboration ? null : (
          <AppText variant="label" color={theme.colors.forest2}>{responsibilityLine(item)}</AppText>
        )}
      </View>
      {!log && item.showCollaboration ? (
        <CollaborationBar
          item={item}
          onClaim={onClaim}
          onUnavailable={onUnavailable}
          onDelegate={onDelegate}
          onInspectRequest={onInspectRequest}
          busy={busy}
        />
      ) : null}
    </View>
  )
}

/**
 * A scoped overview for All/Family views. The action list is intentionally
 * still the source of truth below; this strip only answers the first question
 * in a multi-pet home: which pet needs attention, and what is next.
 */
export function TodayPetOverview({
  items,
  onOpen,
}: {
  items: TodayRow[]
  onOpen: (taskId: string) => void
}) {
  const { theme } = useTheme()
  const groups = new Map<string, TodayRow[]>()
  for (const item of items) {
    const key = `${item.familyId ?? 'family'}:${item.task.pet_id}`
    const group = groups.get(key) ?? []
    group.push(item)
    groups.set(key, group)
  }
  if (groups.size < 2) return null

  return (
    <View
      accessible
      accessibilityLabel={`今日宠物概览，共 ${groups.size} 组照护`}
      style={[
        styles.petOverview,
        theme.shadow.card,
        {
          backgroundColor: theme.colors.paperStrong,
          borderColor: theme.colors.line,
          borderRadius: theme.radius.xl,
        },
      ]}
    >
      <View style={styles.petOverviewHeader}>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="label">今天各只宠物</AppText>
          <AppText variant="caption" muted>先看哪只需要处理，再打开具体事项</AppText>
        </View>
        <AppText variant="caption" color={theme.colors.forest2}>{groups.size} 组照护</AppText>
      </View>
      <View style={styles.petOverviewGrid}>
        {Array.from(groups.entries()).map(([key, group]) => {
          const first = group[0]
          if (!first) return null
          const completed = group.filter(isCareDone).length
          const skipped = group.filter(isCareSkipped).length
          const resolved = completed + skipped
          const next = group.find(isCareOpen)
          const progress = (group.length ? `${Math.round((resolved / group.length) * 100)}%` : '0%') as `${number}%`
          return (
            <PressableScale
              key={key}
              accessibilityRole="button"
              accessibilityLabel={`${first.familyName ? `${first.familyName}，` : ''}${first.petName}，${completed} 项已完成${skipped > 0 ? `，${skipped} 项已跳过` : ''}${next ? `，下一项 ${next.task.title}` : resolved === group.length ? '，今天已处理完' : ''}`}
              onPress={() => next && onOpen(next.task.id)}
              disabled={!next}
              style={[
                styles.petOverviewCard,
                {
                  backgroundColor: theme.colors.paper,
                  borderColor: theme.colors.line,
                },
              ]}
            >
              <PetAvatar petId={first.task.pet_id} species={first.petSpecies} size={42} />
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <AppText variant="label" numberOfLines={1}>
                  {[first.familyName, first.petName].filter(Boolean).join(' · ')}
                </AppText>
                <AppText variant="caption" muted numberOfLines={1}>
                  {resolved}/{group.length} 已处理
                </AppText>
                <View style={[styles.petOverviewTrack, { backgroundColor: theme.colors.line }]}>
                  <View style={[styles.petOverviewFill, { width: progress, backgroundColor: theme.colors.forest }]} />
                </View>
                <AppText variant="caption" color={next ? theme.colors.forest2 : theme.colors.soft} numberOfLines={1}>
                  {next
                    ? `下一项 · ${next.task.title}`
                    : skipped > 0
                      ? `${completed} 项完成 · ${skipped} 项跳过`
                      : '今天已完成'}
                </AppText>
              </View>
              {next ? <CaretRight size={16} color={theme.colors.forest2} weight="bold" /> : <Check size={16} color={theme.colors.forest2} weight="bold" />}
            </PressableScale>
          )
        })}
      </View>
    </View>
  )
}

export function UpcomingRow({
  item,
  focused,
  busy,
  onToggle,
  onSkip,
  onClaim,
  onUnavailable,
  onDelegate,
  onAdjust,
  onInspectRequest,
  canExecute,
}: {
  item: TodayRow
  focused?: boolean
  busy: boolean
  onToggle: () => void
  onSkip: () => void
  onClaim?: () => void
  onUnavailable?: () => void
  onDelegate?: () => void
  onAdjust?: () => void
  onInspectRequest?: () => void
  canExecute: boolean
}) {
  const { theme } = useTheme()
  const { task, log } = item
  const overdue = isTaskOverdue(task, log)
  const cardStyle = [
    styles.upcomingCard,
    theme.shadow.card,
    {
      backgroundColor: theme.colors.paperStrong,
      borderColor: theme.colors.line,
      borderRadius: theme.radius.lg,
      opacity: log ? 0.65 : 1,
    },
    focused && { borderColor: theme.colors.forest2, borderWidth: 2 },
  ]

  const requestMeta = (
      <View style={styles.meta}>
        <Clock size={13} color={theme.colors.soft} weight="bold" />
        <AppText variant="caption" muted numberOfLines={1}>
          {task.time_of_day || '时间未定'}
          {overdue ? ' · 已逾期' : ''}
          {item.careRequestPending
          ? ` · ${responsibilityLine(item)}`
          : item.careRequest && !item.showCollaboration
          ? ` · ${careRequestLine(item.careRequest, item.currentUserId)}`
          : assigneeDisplay(item)
            ? ` · ${assigneeDisplay(item)}`
            : ''}
      {item.careRequest && onInspectRequest ? (
        <CaretRight size={13} color={theme.colors.forest2} weight="bold" />
      ) : null}
      </AppText>
    </View>
  )
  const metaContent = item.careRequest && onInspectRequest ? (
    <PressableScale
      onPress={onInspectRequest}
      accessibilityRole="button"
      accessibilityLabel={`${task.title} 的安排记录`}
      style={styles.metaPressable}
    >
      {requestMeta}
    </PressableScale>
  ) : requestMeta

  const inner = (
    <>
      <PetAvatar petId={task.pet_id} species={item.petSpecies} size={48} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="label" numberOfLines={1}>
          {[item.familyName, item.petName, task.title].filter(Boolean).join(' · ')}
        </AppText>
        {metaContent}
        {item.careRequest && !log ? (
          <AppText variant="caption" soft numberOfLines={1} style={styles.routeLine}>
            {careRequestRouteCopy(item.careRequest, item.currentUserId)}
          </AppText>
        ) : null}
      </View>
      {log ? (
        <AppText variant="caption" soft numberOfLines={2} style={{ maxWidth: 88 }}>
          {item.undoPending ? '撤销已保存 · 联网后同步' : logStatus(log)}
        </AppText>
      ) : canExecute ? (
        <View style={styles.upcomingActions}>
            <PressableScale
              disabled={busy}
              pressedScale={0.9}
              onPress={onToggle}
              accessibilityRole="button"
              accessibilityLabel={`完成 ${task.title}`}
              accessibilityState={{ disabled: busy, busy }}
            style={[styles.circleBtn, { backgroundColor: theme.colors.forest2 }]}
          >
            {busy ? (
              <ActivityIndicator color={theme.colors.onBrand} size="small" />
            ) : (
              <Check size={18} color={theme.colors.onBrand} weight="bold" />
            )}
          </PressableScale>
          <PressableScale
            disabled={busy}
            onPress={onSkip}
            accessibilityRole="button"
            accessibilityLabel={`跳过 ${task.title}`}
            accessibilityState={{ disabled: busy, busy }}
            style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <AppText variant="caption" color={theme.colors.soft}>
              跳过
            </AppText>
          </PressableScale>
          {onAdjust ? (
            <PressableScale
              disabled={busy}
              onPress={onAdjust}
              accessibilityRole="button"
              accessibilityLabel={`调整 ${task.title}`}
              accessibilityState={{ disabled: busy, busy }}
              style={styles.adjustRowButton}
            >
              <AppText variant="caption" color={theme.colors.forest2}>
                调整
              </AppText>
            </PressableScale>
          ) : null}
        </View>
      ) : item.showCollaboration ? null : (
        <AppText variant="caption" color={theme.colors.forest2} numberOfLines={2} style={{ maxWidth: 104 }}>
          {responsibilityLine(item)}
        </AppText>
      )}
    </>
  )

  if (log) {
    const content = item.careRequest && onInspectRequest ? (
      <>
        <PetAvatar petId={task.pet_id} species={item.petSpecies} size={48} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="label" numberOfLines={1}>
            {[item.familyName, item.petName, task.title].filter(Boolean).join(' · ')}
          </AppText>
          {requestMeta}
        </View>
        <AppText variant="caption" soft numberOfLines={2} style={{ maxWidth: 88 }}>
          {item.undoPending ? '撤销已保存 · 联网后同步' : logStatus(log)}
        </AppText>
      </>
    ) : inner
    if (!item.canUndo) {
      return <View style={[styles.upcoming, cardStyle]}>{content}</View>
    }
    return (
      <View style={[styles.upcoming, cardStyle]}>
        <View style={styles.resolvedMain}>{content}</View>
        <PressableScale
          disabled={busy || item.undoPending}
          pressedScale={0.96}
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy || item.undoPending }}
          accessibilityLabel={`${task.title}，${item.undoPending ? '撤销已保存，联网后同步' : `${logStatus(log)}，撤销`}`}
          style={[styles.undoBtn, { backgroundColor: theme.colors.sageSoft, opacity: busy || item.undoPending ? 0.5 : 1 }]}
        >
          <ArrowCounterClockwise size={15} color={theme.colors.forest2} weight="bold" />
          <AppText variant="caption" color={theme.colors.forest2}>
            {item.undoPending ? '已保存' : '撤销'}
          </AppText>
        </PressableScale>
      </View>
    )
  }

  return (
    <View style={cardStyle}>
      <View style={styles.upcoming}>{inner}</View>
      {!log && item.showCollaboration ? (
        <CollaborationBar
          item={item}
          onClaim={onClaim}
          onUnavailable={onUnavailable}
          onDelegate={onDelegate}
          onInspectRequest={onInspectRequest}
          busy={busy}
          compact
        />
      ) : null}
    </View>
  )
}

function UsersIcon({ color }: { color: string }) {
  return <Users size={16} color={color} weight="bold" />
}

export function AllDoneCard({
  completed,
  skipped,
}: {
  completed: number
  skipped: number
}) {
  const { theme } = useTheme()
  return (
    <FadeInView>
    <LinearGradient
      colors={[theme.colors.mint, theme.colors.sageSoft]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.allDone, { borderRadius: theme.radius.xl }]}
    >
      <View style={{ flex: 1, gap: 6 }}>
        <AppText variant="eyebrow" color={theme.colors.forest2}>
          今日状态
        </AppText>
        <AppText variant="title" color={theme.colors.forest}>
          照护事项已全部处理
        </AppText>
        <AppText muted>
          {skipped > 0
            ? `${completed} 项完成 · ${skipped} 项跳过 · 均已写入时间线`
            : `${completed} 项全部完成 · 均已写入时间线`}
        </AppText>
      </View>
      <Confetti size={28} color={theme.colors.forest2} weight="duotone" />
    </LinearGradient>
    </FadeInView>
  )
}

const styles = StyleSheet.create({
  petOverview: {
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 12,
  },
  petOverviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  petOverviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  petOverviewCard: {
    flex: 1,
    minWidth: 220,
    minHeight: 76,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 15,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  petOverviewTrack: {
    height: 4,
    width: '100%',
    overflow: 'hidden',
    borderRadius: 999,
  },
  petOverviewFill: {
    height: '100%',
    borderRadius: 999,
  },
  feature: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  featureHero: {
    minHeight: 148,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  featureHeroCompact: {
    minHeight: 126,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  featureHeroCopy: { flex: 1, gap: 5, minWidth: 0 },
  featureMarker: {
    position: 'absolute',
    width: 4,
    height: 58,
    borderRadius: 4,
    left: 0,
    top: 45,
  },
  featureEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  featureTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  overdue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  featureBody: {
    padding: 20,
    gap: 12,
  },
  featureBodyCompact: {
    padding: 16,
    gap: 10,
  },
  featureActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  collaborationBar: {
    gap: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 11,
    marginTop: 2,
  },
  collaborationActions: {
    flexDirection: 'row',
    gap: 8,
  },
  collaborationAction: {
    flex: 1,
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 10,
  },
  collaborationMore: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  collaborationStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  collaborationInspect: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
  },
  completeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  skipBtn: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    justifyContent: 'center',
  },
  resolvedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 4,
  },
  responsibilityBadge: {
    alignSelf: 'flex-start',
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  responsibilityPressable: { alignSelf: 'flex-start' },
  responsibilityCopy: {
    minWidth: 0,
    gap: 1,
  },
  responsibilityOpen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    paddingLeft: 4,
  },
  routeLine: {
    marginTop: 1,
  },
  metaPressable: { flexShrink: 1 },
  resolvedMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  undoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  upcoming: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
  },
  upcomingCard: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  upcomingActions: {
    alignItems: 'center',
    gap: 6,
  },
  rowCollaboration: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 10,
    paddingTop: 6,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    paddingHorizontal: 10,
  },
  rowCollaborationStatus: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  rowCollaborationActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  collaborationStatusLine: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  rowCollaborationAction: {
    minHeight: 44,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  rowCollaborationMore: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  adjustBtn: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjustRowButton: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 20,
  },
})
