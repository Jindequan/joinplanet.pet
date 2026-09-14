import React, { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock, Heartbeat, PawPrint, PauseCircle, PencilSimple, Pill, PlayCircle, Scales, Stethoscope, Trash } from 'phosphor-react-native'
import { router } from 'expo-router'
import {
  createIdempotencyKey,
  planetApi,
  type CareAssignment,
  type Medication,
  type Pet,
} from '../../core/api/planet-api'
import { errorMessage } from '../../core/api/errors'
import { carePlanTypeLabel, ruleText } from '../../core/display'
import { queryKeys } from '../../core/query/keys'
import { invalidateAfterCarePlanChange, invalidateAfterActivationChange } from '../../core/foundation'
import { useFoundationWriters } from '../../core/foundation/hooks'
import { civilDateInTimezone, formatCareCivilDate } from '../../core/time/civil'
import { useTheme } from '../../core/providers/theme-provider'
import { useToast } from '../../core/providers/toast-provider'
import { useScope } from '../../core/providers/scope-provider'
import { AppText } from '../../ui/components/app-text'
import { Button } from '../../ui/components/button'
import { Card } from '../../ui/components/card'
import { ChoiceChips } from '../../ui/components/choice-chips'
import { ConfirmDialog } from '../../ui/components/confirm-dialog'
import { DateField, TimeField } from '../../ui/components/date-field'
import { EmptyState } from '../../ui/components/empty-state'
import { LoadingState } from '../../ui/components/loading-state'
import { ModalSheet } from '../../ui/components/modal-sheet'
import { OptionSheet, SelectField } from '../../ui/components/option-sheet'
import { TextField } from '../../ui/components/text-field'
import { FadeInView, PressableScale, hapticSelection, hapticSuccess } from '../../ui/motion'
import { CARE_TEMPLATES, type CarePlanRow, type CareTemplate } from './types'

type Props = {
  pet: Pet
  timezone?: string
  timezoneAmbiguous?: boolean
  timezoneUnavailable?: boolean
  familyId?: string
  initialShowForm?: boolean
  /** After creating a pet: emphasize templates + path back to Today. */
  setup?: boolean
  /** Viewers can inspect plans and responsibility, but cannot change them. */
  readOnly?: boolean
  /** Family owners and the Pet owner can change the recurring plan and chain. */
  canManagePlans?: boolean
}

export function CareSection({ pet, timezone, timezoneAmbiguous = false, timezoneUnavailable = false, familyId, initialShowForm = false, setup = false, readOnly = false, canManagePlans = false }: Props) {
  const { theme } = useTheme()
  const { showToast } = useToast()
  const { setScope } = useScope()
  const client = useQueryClient()
  const query = useQuery({
    queryKey: queryKeys.carePlans(pet.id, true, familyId),
    queryFn: () => planetApi.pets.carePlans(pet.id, true, familyId),
  })
  const medicationsQuery = useQuery({
    queryKey: queryKeys.medications(pet.id),
    queryFn: () => planetApi.pets.medications(pet.id),
  })
  const [show, setShow] = useState(initialShowForm)
  const [confirm, setConfirm] = useState<CarePlanRow | null>(null)
  const [editing, setEditing] = useState<CarePlanRow | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<CareTemplate | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [busyPlanId, setBusyPlanId] = useState('')
  const plans = (query.data?.care_plans ?? []) as CarePlanRow[]
  const medications = medicationsQuery.data?.medications ?? []
  const medicationById = new Map(medications.map((medication) => [medication.id, medication]))
  const activePlans = plans.filter((plan) => plan.status !== 'archived')
  const archivedPlans = plans.filter((plan) => plan.status === 'archived')
  const visiblePlans = showArchived ? plans : activePlans
  const canCreate = canManagePlans && !timezoneAmbiguous && !timezoneUnavailable
  const assignmentQueries = useQueries({
    queries: plans.map((plan) => ({
      queryKey: queryKeys.assignments(plan.id, familyId),
      queryFn: () => planetApi.carePlans.assignments(plan.id, familyId),
      enabled: Boolean(plan.id),
    })),
  })
  const assignmentByPlanId = new Map(
    plans.map((plan, index) => [plan.id, assignmentQueries[index]]),
  )

  async function invalidate() {
    invalidateAfterCarePlanChange(client, pet.id)
    invalidateAfterActivationChange(client)
  }

  if (query.isLoading) {
    return <LoadingState label="正在加载照护计划" />
  }
  if (query.error) {
    return (
      <Card>
        <AppText accessibilityRole="alert" color={theme.colors.danger}>{errorMessage(query.error)}</AppText>
        <Button label="重试" onPress={() => void query.refetch()} style={{ marginTop: 10 }} />
      </Card>
    )
  }

  function openCustomForm() {
    setSelectedTemplate(null)
    setShow(true)
  }

  function openTemplateForm(template: CareTemplate) {
    setSelectedTemplate(template)
    setShow(true)
  }

  function closeForm() {
    setShow(false)
    setSelectedTemplate(null)
  }

  async function togglePlan(plan: CarePlanRow) {
    if (plan.status === 'archived' || isOneTimePlan(plan) || busyPlanId === plan.id) return
    const nextStatus = plan.status === 'paused' ? 'active' : 'paused'
    setBusyPlanId(plan.id)
    try {
      await planetApi.carePlans.update(plan.id, { status: nextStatus })
      await invalidate()
      void hapticSuccess()
      showToast({ message: nextStatus === 'paused' ? `已暂停「${plan.title}」` : `已恢复「${plan.title}」` })
    } catch (e) {
      showToast({ message: errorMessage(e) })
    } finally {
      setBusyPlanId('')
    }
  }

  return (
    <View style={{ gap: 14 }}>
      <View style={styles.heading}>
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="heading">
            {setup ? '选一条日常照护' : '照护计划'}
          </AppText>
          {setup ? (
            <AppText muted>选一项并确认，今天就会出现在清单里。</AppText>
          ) : readOnly ? (
            <AppText muted>你可以查看计划和负责人，但不能修改这只宠物的安排。</AppText>
          ) : pet.archived_at ? (
            <AppText muted>档案已归档；历史安排仍可查看，但不能新增或修改。</AppText>
          ) : !canManagePlans ? (
            <AppText muted>你可以按安排完成照护；家庭 owner 或宠物所有者可以修改计划和固定负责人。</AppText>
          ) : (
            <AppText muted>选快捷模板或自定义，确认后今天页会自动生成待办。</AppText>
          )}
        </View>
        {!pet.archived_at && !setup && canManagePlans ? (
          <Button label="自定义" disabled={!canCreate} onPress={openCustomForm} style={{ paddingHorizontal: 12 }} />
        ) : null}
      </View>

      {timezoneAmbiguous ? (
        <Card style={{ gap: 4, backgroundColor: theme.colors.coralSoft }}>
          <AppText variant="label" color={theme.colors.coralDark}>请先选择家庭</AppText>
          <AppText variant="caption" color={theme.colors.coralDark}>
            这只宠物属于多个家庭；选择家庭后，新增照护才会使用正确的日期和时区。
          </AppText>
        </Card>
      ) : null}
      {timezoneUnavailable && !timezoneAmbiguous ? (
        <Card style={{ gap: 4, backgroundColor: theme.colors.coralSoft }}>
          <AppText variant="label" color={theme.colors.coralDark}>家庭日期设置还没准备好</AppText>
          <AppText variant="caption" color={theme.colors.coralDark}>
            先等家庭设置加载完成；确认时区后才能新增或修改照护计划。
          </AppText>
        </Card>
      ) : null}

      {!pet.archived_at && canCreate ? (
        <View style={styles.templateSection}>
          <AppText variant="eyebrow" soft>
            常用照护
          </AppText>
          <AppText variant="caption" muted>
            选一张卡，确认时间和频率后立即加入这只宠物的日常安排。
          </AppText>
          <View style={styles.templateGrid}>
            {CARE_TEMPLATES.map((template, index) => (
              <FadeInView key={template.key} index={index} style={styles.templateItem}>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={`设置照护计划：${template.title}，${templateScheduleLabel(template)}`}
                  onPress={() => openTemplateForm(template)}
                  style={[
                    styles.templateCard,
                    {
                      backgroundColor: theme.colors.paperStrong,
                      borderColor: theme.colors.line,
                      borderRadius: theme.radius.md,
                    },
                  ]}
                >
                  <View style={[styles.templateIcon, { backgroundColor: theme.colors.sageSoft }]}>
                    <CareTemplateIcon template={template} />
                  </View>
                  <View style={styles.templateCopy}>
                    <AppText variant="label" numberOfLines={1}>{template.title}</AppText>
                    <AppText variant="caption" color={theme.colors.forest2} numberOfLines={1}>
                      {templateScheduleLabel(template)}
                    </AppText>
                  </View>
                </PressableScale>
              </FadeInView>
            ))}
          </View>
        </View>
      ) : null}

      {setup ? (
        <Button
          label="稍后再说，回今天"
          variant="ghost"
          onPress={() => router.replace({
            pathname: '/(tabs)',
            params: { pet_id: pet.id, ...(familyId ? { family_id: familyId } : {}) },
          } as never)}
        />
      ) : null}

      {plans.length === 0 && !setup ? (
        <EmptyState
          title="还没有照护计划"
          description="选上面一项，或自定义一条。今天页会自动出现任务。"
        />
      ) : plans.length === 0 ? null : (
        <View style={{ gap: 10 }}>
          {activePlans.length > 0 ? (
            <AppText variant="eyebrow" soft>
              当前安排
            </AppText>
          ) : !showArchived ? (
            <EmptyState
              title="没有进行中的照护计划"
              description="历史安排仍保留在已归档计划里。"
            />
          ) : null}
          {visiblePlans.map((plan, index) => (
            <CarePlanCard
              key={plan.id}
              plan={plan}
              index={index}
              petId={pet.id}
              familyId={familyId}
              timezone={timezone}
              canManagePlans={canManagePlans}
              timezoneAmbiguous={timezoneAmbiguous}
              timezoneUnavailable={timezoneUnavailable}
              busy={busyPlanId === plan.id}
              assignmentQuery={assignmentByPlanId.get(plan.id)}
              medication={plan.medication_id ? medicationById.get(plan.medication_id) : undefined}
              medicationsLoading={medicationsQuery.isLoading}
              onToggle={() => void togglePlan(plan)}
              onEdit={() => setEditing(plan)}
              onDelete={() => setConfirm(plan)}
            />
          ))}
          {archivedPlans.length > 0 ? (
            <Button
              label={showArchived ? '收起已归档计划' : `查看已归档计划（${archivedPlans.length}）`}
              variant="ghost"
              accessibilityRole="button"
              onPress={() => setShowArchived((value) => !value)}
            />
          ) : null}
        </View>
      )}

      <CarePlanForm
        visible={show && canCreate}
        petId={pet.id}
        familyId={familyId}
        timezone={timezone}
        template={selectedTemplate}
        medications={medicationsQuery.data?.medications ?? []}
        medicationsLoading={medicationsQuery.isLoading}
        medicationsError={medicationsQuery.error}
        onRetryMedications={() => void medicationsQuery.refetch()}
        onClose={closeForm}
          onSaved={async () => {
            closeForm()
            const wasEmpty = activePlans.length === 0
            await invalidate()
            if (wasEmpty) {
              if (setup && familyId) setScope({ type: 'pet', id: pet.id, familyId })
              router.push({ pathname: '/(tabs)', params: { pet_id: pet.id, family_id: familyId } } as never)
            }
          }}
      />

      {editing ? (
        <CarePlanEdit
          visible
          plan={editing}
          petId={pet.id}
          timezone={timezone}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await invalidate()
          }}
        />
      ) : null}

      <ConfirmDialog
        visible={Boolean(confirm)}
        title={`删除「${confirm?.title ?? ''}」？`}
        consequence="未来的任务停止生成；已完成的历史仍保留在时间线里。"
        confirmLabel="删除计划"
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return
          await planetApi.carePlans.delete(confirm.id)
          setConfirm(null)
          showToast({ message: `照护计划「${confirm.title}」已删除，历史记录仍保留。` })
          await invalidate()
        }}
      />
    </View>
  )
}

function isOneTimePlan(plan: CarePlanRow): boolean {
  return plan.schedule?.kind === 'once'
}

function templateScheduleLabel(template: CareTemplate) {
  const cadence = template.rule.type === 'daily'
    ? '每天'
    : template.rule.type === 'weekly'
      ? '每周'
      : template.rule.type === 'monthly'
        ? '每月'
        : '按间隔'
  return `${cadence} · ${template.rule.time}`
}

function CareTemplateIcon({ template }: { template: CareTemplate }) {
  const { theme } = useTheme()
  const props = { size: 18, color: theme.colors.forest2, weight: 'duotone' as const }
  if (template.type === 'medication') return <Pill {...props} />
  if (template.key === 'weigh') return <Scales {...props} />
  if (template.key === 'checkup') return <Stethoscope {...props} />
  if (template.type === 'exercise') return <Heartbeat {...props} />
  if (template.type === 'grooming') return <PawPrint {...props} />
  if (template.type === 'health') return <Stethoscope {...props} />
  return <Clock {...props} />
}

function CarePlanCard({
  plan,
  index,
  petId,
  familyId,
  timezone,
  canManagePlans,
  timezoneAmbiguous,
  timezoneUnavailable,
  busy,
  assignmentQuery,
  medication,
  medicationsLoading,
  onToggle,
  onEdit,
  onDelete,
}: {
  plan: CarePlanRow
  index: number
  petId: string
  familyId?: string
  timezone?: string
  canManagePlans: boolean
  timezoneAmbiguous: boolean
  timezoneUnavailable: boolean
  busy: boolean
  assignmentQuery?: { data?: { assignments: CareAssignment[] }; isLoading: boolean; isError: boolean }
  medication?: Medication
  medicationsLoading: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { theme } = useTheme()
  const oneTime = isOneTimePlan(plan)
  return (
    <FadeInView index={index}>
      <Card
        style={{
          opacity: plan.status === 'archived' ? 0.65 : plan.status === 'paused' ? 0.82 : 1,
          gap: 10,
        }}
      >
        <View style={styles.planTop}>
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="eyebrow" soft>
              {oneTime ? '临时安排' : carePlanTypeLabel(plan.type)}
              {plan.status === 'paused' ? ' · 已暂停' : plan.status === 'archived' ? ' · 已归档' : ''}
            </AppText>
            <AppText variant="heading">{plan.title}</AppText>
            <AppText muted>{ruleText(plan.schedule, plan.time_of_day)}</AppText>
            {plan.type === 'medication' || plan.medication_id ? (
              medicationsLoading ? (
                <AppText variant="caption" muted>正在读取关联药物…</AppText>
              ) : medication ? (
                <AppText variant="caption" color={theme.colors.forest2}>
                  关联药物 · {medication.name}{medication.dose ? ` · ${medication.dose}` : ''}
                </AppText>
              ) : (
                <AppText accessibilityRole="alert" variant="caption" color={theme.colors.danger}>
                  关联药物记录暂时不可用，请检查用药史。
                </AppText>
              )
            ) : null}
            {oneTime ? (
              <AppText variant="caption" color={theme.colors.forest2}>
                只影响这一天；转交和完成请在 Today 处理。
              </AppText>
            ) : nextOccurrenceText(plan, timezone) ? (
              <AppText variant="caption" color={theme.colors.forest2}>
                {nextOccurrenceText(plan, timezone)}
              </AppText>
            ) : null}
            <PlanResponsibility query={assignmentQuery} />
          </View>
          {canManagePlans && plan.status !== 'archived' ? (
            <View style={styles.iconActions}>
              {!oneTime ? (
                <Button
                  label="管理负责人"
                  variant="secondary"
                  accessibilityRole="button"
                  onPress={() =>
                    router.push(`/pets/${petId}/care/${plan.id}/assignments${familyId ? `?familyId=${encodeURIComponent(familyId)}` : ''}` as never)
                  }
                  style={styles.assignmentButton}
                />
              ) : null}
              {!oneTime ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={plan.status === 'paused' ? '恢复计划' : '暂停计划'}
                  disabled={busy}
                  onPress={onToggle}
                  style={[styles.iconBtn, { opacity: busy ? 0.45 : 1 }]}
                >
                  {plan.status === 'paused' ? (
                    <PlayCircle size={18} color={theme.colors.forest2} />
                  ) : (
                    <PauseCircle size={18} color={theme.colors.forest2} />
                  )}
                </Pressable>
              ) : null}
              {!oneTime ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="编辑计划"
                  disabled={timezoneAmbiguous || timezoneUnavailable}
                  onPress={onEdit}
                  style={[styles.iconBtn, { opacity: timezoneAmbiguous || timezoneUnavailable ? 0.4 : 1 }]}
                >
                  <PencilSimple size={18} color={theme.colors.forest2} />
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="删除计划"
                onPress={onDelete}
                style={styles.iconBtn}
              >
                <Trash size={18} color={theme.colors.danger} />
              </Pressable>
            </View>
          ) : (
            <AppText variant="caption" soft>
              {plan.status === 'archived' ? '历史记录' : '只读'}
            </AppText>
          )}
        </View>
      </Card>
    </FadeInView>
  )
}

function nextOccurrenceText(plan: CarePlanRow, timezone?: string): string | null {
  if (plan.status !== 'active' || !plan.due_date) return null
  const today = civilDateInTimezone(timezone ?? plan.timezone)
  const todayParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today)
  const dueParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(plan.due_date)
  const deltaDays = todayParts && dueParts
    ? Math.round(
        (Date.UTC(Number(dueParts[1]), Number(dueParts[2]) - 1, Number(dueParts[3])) -
          Date.UTC(Number(todayParts[1]), Number(todayParts[2]) - 1, Number(todayParts[3]))) /
          86_400_000,
      )
    : Number.NaN
  const dateLabel = deltaDays === 0
    ? '今天'
      : deltaDays === 1
        ? '明天'
        : formatCareCivilDate(plan.due_date)
  const overdue = Boolean(plan.due_at && new Date(plan.due_at).getTime() < Date.now())
  return `下一次 · ${dateLabel}${plan.time_of_day ? ` ${plan.time_of_day}` : ''}${overdue ? ' · 已逾期' : ''}`
}

function PlanResponsibility({
  query,
}: {
  query?: {
    data?: { assignments: CareAssignment[] }
    isLoading: boolean
    isError: boolean
  }
}) {
  if (!query) return null
  const assignments = query.data?.assignments ?? []
  const owner = assignments.find((assignment) => assignment.role === 'owner')
  const helperCount = assignments.filter((assignment) => assignment.role === 'helper').length
  if (query.isLoading) return <AppText variant="caption" muted>正在加载负责人…</AppText>
  if (query.isError) return <AppText accessibilityRole="alert" variant="caption" muted>负责人暂时无法加载</AppText>
  if (!owner) return <AppText variant="caption" color="#8A4B2A">还没有固定负责人</AppText>
  return (
    <AppText variant="caption" muted>
      固定负责人 · {owner.user_name}{helperCount > 0 ? ` · 备用 ${helperCount} 人` : ''}
    </AppText>
  )
}

type RecurrenceKind = 'daily' | 'weekly' | 'monthly' | 'interval'

const RULE_OPTIONS: Array<{ value: RecurrenceKind; label: string }> = [
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'interval', label: '每隔 N 天' },
]

function parsePlanSchedule(raw: Record<string, unknown> | undefined): {
  rule: RecurrenceKind
  days: number[]
  day: string
  interval: string
} {
  const kind = typeof raw?.kind === 'string' ? raw.kind : ''
  const rule: RecurrenceKind =
    kind === 'weekly' || kind === 'monthly' || kind === 'interval' ? kind : 'daily'
  const days = Array.isArray(raw?.days)
    ? raw.days.filter((item): item is number => typeof item === 'number')
    : [1]
  const dayValue = typeof raw?.day === 'number' ? raw.day : 1
  const intervalValue =
    typeof raw?.interval === 'number'
      ? raw.interval
      : typeof raw?.every_n === 'number'
        ? raw.every_n
        : 1
  return {
    rule,
    days: days.length ? days : [1],
    day: String(dayValue),
    interval: String(intervalValue),
  }
}

function scheduleFromFields(
  rule: RecurrenceKind,
  days: number[],
  day: string,
  interval: string,
): Record<string, unknown> {
  const schedule: Record<string, unknown> = { v: 1, kind: rule }
  if (rule === 'weekly') schedule.days = days
  if (rule === 'monthly') schedule.day = Number(day)
  if (rule === 'interval') schedule.interval = Number(interval)
  return schedule
}

function recurrenceValid(rule: RecurrenceKind, days: number[], day: string, interval: string) {
  if (rule === 'weekly' && days.length === 0) return false
  if (rule === 'interval' && Number(interval) < 1) return false
  if (rule === 'monthly') {
    const n = Number(day)
    if (n < 1 || n > 31) return false
  }
  return true
}

function RecurrenceFields({
  rule,
  onRuleChange,
  days,
  onDaysChange,
  day,
  onDayChange,
  interval,
  onIntervalChange,
}: {
  rule: RecurrenceKind
  onRuleChange: (next: RecurrenceKind) => void
  days: number[]
  onDaysChange: (next: number[]) => void
  day: string
  onDayChange: (next: string) => void
  interval: string
  onIntervalChange: (next: string) => void
}) {
  const { theme } = useTheme()
  return (
    <>
      <ChoiceChips label="重复规则" options={RULE_OPTIONS} value={rule} onChange={onRuleChange} />
      {rule === 'weekly' ? (
        <View style={styles.chips} accessibilityLabel="每周哪几天">
          {['一', '二', '三', '四', '五', '六', '日'].map((label, index) => {
            const dayValue = index + 1
            const selected = days.includes(dayValue)
            return (
              <Pressable
                key={label}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                onPress={() => {
                  void hapticSelection()
                  onDaysChange(
                    days.includes(dayValue)
                      ? days.filter((item) => item !== dayValue)
                      : [...days, dayValue],
                  )
                }}
                style={[
                  styles.dayChip,
                  {
                    backgroundColor: selected ? theme.colors.forest2 : theme.colors.sageSoft,
                    borderRadius: theme.radius.pill,
                  },
                ]}
              >
                <AppText
                  variant="caption"
                  color={selected ? theme.colors.onBrand : theme.colors.forest2}
                >
                  {label}
                </AppText>
              </Pressable>
            )
          })}
        </View>
      ) : null}
      {rule === 'monthly' ? (
          <TextField label="每月几号（1–31）" value={day} onChangeText={onDayChange} maxLength={2} keyboardType="number-pad" />
      ) : null}
      {rule === 'interval' ? (
        <TextField
          label="间隔天数（≥1）"
          value={interval}
          onChangeText={onIntervalChange}
          maxLength={3}
          keyboardType="number-pad"
        />
      ) : null}
    </>
  )
}

function CarePlanForm({
  visible,
  petId,
  familyId,
  timezone,
  template,
  medications,
  medicationsLoading,
  medicationsError,
  onRetryMedications,
  onClose,
  onSaved,
}: {
  visible: boolean
  petId: string
  familyId?: string
  timezone?: string
  template: CareTemplate | null
  medications: Medication[]
  medicationsLoading: boolean
  medicationsError: unknown
  onRetryMedications: () => void
  onClose: () => void
  onSaved: () => void
}) {
  const { theme } = useTheme()
  const [title, setTitle] = useState('')
  const [type, setType] = useState<CareTemplate['type']>('custom')
  const [rule, setRule] = useState<RecurrenceKind>('daily')
  const [time, setTime] = useState('')
  const [days, setDays] = useState<number[]>([1])
  const [day, setDay] = useState('1')
  const [interval, setIntervalValue] = useState('1')
  const [startDate, setStartDate] = useState(civilDateInTimezone(timezone))
  const [endDate, setEndDate] = useState('')
  const [description, setDescription] = useState('')
  const [medicationId, setMedicationId] = useState('')
  const [medicationPickerVisible, setMedicationPickerVisible] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const commandId = useRef(createIdempotencyKey())
  const templateKey = template?.key ?? 'custom'

  useEffect(() => {
    if (!visible) return
    setTitle(template?.title ?? '')
    setType(template?.type ?? 'custom')
    setRule(template?.rule.type ?? 'daily')
    setTime(template?.rule.time ?? '')
    setDays(template?.rule.days ?? [1])
    setDay('1')
    setIntervalValue('1')
    setStartDate(civilDateInTimezone(timezone))
    setEndDate('')
    setDescription('')
    setMedicationId('')
    setMedicationPickerVisible(false)
    setShowMore(false)
    setError('')
    setBusy(false)
    commandId.current = createIdempotencyKey()
  }, [templateKey, timezone, visible])

  const activeMedications = medications.filter((medication) => !medication.ended_on)
  useEffect(() => {
    if (type !== 'medication' || medicationId || activeMedications.length === 0) return
    setMedicationId(activeMedications[0]!.id)
  }, [activeMedications, medicationId, type])

  const types = [
    { value: 'custom', label: '自定义' },
    { value: 'feeding', label: '饮食' },
    { value: 'health', label: '健康' },
    { value: 'grooming', label: '清洁' },
    { value: 'exercise', label: '运动' },
    { value: 'medication', label: '定点给药' },
  ]

  async function save() {
    const valid =
      Boolean(title.trim()) &&
      recurrenceValid(rule, days, day, interval) &&
      (!endDate || endDate >= startDate)
    if (!valid || (type === 'medication' && !medicationId)) {
      setError(type === 'medication' && activeMedications.length === 0
        ? '请先在下方“用药史”添加正在使用的药物，再创建定点给药计划。'
        : type === 'medication' && !medicationId
          ? '请选择要关联的药物。'
          : '请检查：标题不能为空；周计划至少选一天，间隔至少 1 天。')
      return
    }
    setBusy(true)
    setError('')
    try {
      await planetApi.pets.createCarePlan(
        petId,
        {
          ...(familyId ? { family_id: familyId } : {}),
          // Preserve the selected category. It drives the plan label, timeline
          // icon and downstream care statistics.
          type,
          title: title.trim(),
          description,
          ...(type === 'medication' && medicationId ? { medication_id: medicationId } : {}),
          rule: {
            type: rule,
            interval: Number(interval),
            days,
            day: Number(day),
            ...(time ? { time } : {}),
            start_date: startDate,
            end_date: endDate,
          },
        },
        commandId.current,
      )
      commandId.current = createIdempotencyKey()
      onSaved()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalSheet visible={visible} onClose={onClose} busy={busy}>
      <AppText variant="eyebrow" soft>
        照护计划
      </AppText>
      <AppText variant="heading">
        {template ? `确认「${template.title}」` : '新增照护计划'}
      </AppText>
      <AppText variant="caption" muted>
        设置多久做一次、几点出现；确认后才会生成 Today 待办。
      </AppText>
      <TextField label="标题" value={title} onChangeText={setTitle} maxLength={120} placeholder="早上吃药" />
      {type === 'medication' ? (
        medicationsLoading ? (
          <AppText variant="caption" muted>正在读取可关联的用药记录…</AppText>
        ) : medicationsError ? (
          <Card style={{ gap: 8 }}>
            <AppText accessibilityRole="alert" variant="caption" color={theme.colors.danger}>
              暂时无法读取用药记录，不能安全创建定点给药计划。
            </AppText>
            <Button label="重试" variant="ghost" onPress={onRetryMedications} />
          </Card>
        ) : activeMedications.length === 0 ? (
          <Card style={{ gap: 8 }}>
            <AppText variant="caption" muted>
              先在本页下方“用药史”添加正在使用的药物，计划才会和停药及提醒自动联动。
            </AppText>
            <Button label="知道了，去下方添加" variant="ghost" onPress={onClose} />
          </Card>
        ) : (
          <>
            <SelectField
              label="关联药物"
              value={activeMedications.find((medication) => medication.id === medicationId)?.name ?? '请选择药物'}
              onPress={() => setMedicationPickerVisible(true)}
            />
            <OptionSheet
              visible={medicationPickerVisible}
              title="选择关联药物"
              selected={medicationId}
              options={activeMedications.map((medication) => ({
                value: medication.id,
                label: medication.dose ? `${medication.name} · ${medication.dose}` : medication.name,
              }))}
              onClose={() => setMedicationPickerVisible(false)}
              onSelect={(value) => {
                setMedicationId(value)
                setMedicationPickerVisible(false)
              }}
            />
          </>
        )
      ) : null}
      {showMore ? (
        <ChoiceChips
          label="类型"
          options={types}
          value={type}
          onChange={(value) => setType(value as CareTemplate['type'])}
        />
      ) : null}
      <RecurrenceFields
        rule={rule}
        onRuleChange={setRule}
        days={days}
        onDaysChange={setDays}
        day={day}
        onDayChange={setDay}
        interval={interval}
        onIntervalChange={setIntervalValue}
      />
      <TimeField label="出现在今天的时间（选填）" value={time} onChange={setTime} />
      <DateField label="开始日期" value={startDate} onChange={setStartDate} clearable={false} />
      {showMore ? (
        <>
          <DateField
            label="结束日期（选填）"
            value={endDate}
            onChange={setEndDate}
            placeholder="不设置则长期有效"
          />
          <TextField
            label="说明"
            value={description}
            onChangeText={setDescription}
            maxLength={1200}
            multiline
            style={{ minHeight: 72, textAlignVertical: 'top' }}
          />
        </>
      ) : null}
      <Button
        label={showMore ? '收起更多' : '更多选项'}
        variant="ghost"
        onPress={() => setShowMore((value) => !value)}
      />
      {error ? (
        <AppText accessibilityRole="alert" variant="caption" color={theme.colors.danger}>
          {error}
        </AppText>
      ) : null}
      <View style={styles.actions}>
        <Button label="取消" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
        <Button
          label="创建计划"
          busy={busy}
          disabled={type === 'medication' && (medicationsLoading || Boolean(medicationsError) || activeMedications.length === 0 || !medicationId)}
          onPress={() => void save()}
          style={{ flex: 1 }}
        />
      </View>
    </ModalSheet>
  )
}

function CarePlanEdit({
  visible,
  plan,
  petId,
  timezone,
  onClose,
  onSaved,
}: {
  visible: boolean
  plan: CarePlanRow
  petId: string
  timezone?: string
  onClose: () => void
  onSaved: () => void
}) {
  const { theme } = useTheme()
  const foundationWriters = useFoundationWriters()
  const original = parsePlanSchedule(plan.schedule)
  const [title, setTitle] = useState(plan.title)
  const [description, setDescription] = useState(plan.description ?? '')
  const [time, setTime] = useState(plan.time_of_day ?? '')
  const [rule, setRule] = useState<RecurrenceKind>(original.rule)
  const [days, setDays] = useState<number[]>(original.days)
  const [day, setDay] = useState(original.day)
  const [interval, setIntervalValue] = useState(original.interval)
  const [timeScope, setTimeScope] = useState<'tomorrow' | 'today'>('tomorrow')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const commandId = useRef(createIdempotencyKey())

  const timeChanged = time !== (plan.time_of_day ?? '')
  const cadenceChanged =
    rule !== original.rule ||
    day !== original.day ||
    interval !== original.interval ||
    [...days].sort().join(',') !== [...original.days].sort().join(',')
  const scheduleChanged = timeChanged || cadenceChanged

  async function save() {
    if (!title.trim()) {
      setError('标题不能为空。')
      return
    }
    if (!recurrenceValid(rule, days, day, interval)) {
      setError('请检查规则：周计划至少选一天，间隔至少 1 天，每月日期 1–31。')
      return
    }
    setBusy(true)
    setError('')
    try {
      const titleChanged = title.trim() !== plan.title
      const descriptionChanged = description !== (plan.description ?? '')
      if (titleChanged || descriptionChanged) {
        await planetApi.carePlans.update(plan.id, {
          title: title.trim(),
          description,
          schedule: plan.schedule,
          ...(scheduleChanged ? {} : { time_of_day: time || null }),
        })
      }
      if (scheduleChanged) {
        const civilToday = civilDateInTimezone(timezone)
        const effectiveFrom =
          timeScope === 'today'
            ? civilToday
            : (() => {
                const parsed = new Date(`${civilToday}T12:00:00`)
                parsed.setDate(parsed.getDate() + 1)
                return civilDateInTimezone(timezone, parsed)
              })()
        await foundationWriters.applyScheduleAction({
          action: 'change_rule',
          scope: 'from_date',
          slot: { care_plan_id: plan.id },
          payload: {
            effective_from: effectiveFrom,
            // The schedule action also needs the PATCH tri-state contract:
            // omitted means keep the current time, null means clear it.
            time_of_day: time || null,
            schedule: scheduleFromFields(rule, days, day, interval),
          },
          idempotencyKey: commandId.current,
          petId,
        })
      }
      commandId.current = createIdempotencyKey()
      onSaved()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalSheet visible={visible} onClose={onClose} busy={busy}>
      <AppText variant="eyebrow" soft>
        照护计划
      </AppText>
      <AppText variant="heading">编辑「{plan.title}」</AppText>
      <TextField label="标题" value={title} onChangeText={setTitle} maxLength={120} />
      <RecurrenceFields
        rule={rule}
        onRuleChange={setRule}
        days={days}
        onDaysChange={setDays}
        day={day}
        onDayChange={setDay}
        interval={interval}
        onIntervalChange={setIntervalValue}
      />
      <TimeField
        label={`出现在今天的时间（当前：${ruleText(plan.schedule, plan.time_of_day)}）`}
        value={time}
        onChange={setTime}
      />
      {scheduleChanged ? (
        <ChoiceChips
          label="改循环作用范围"
          options={[
            { value: 'tomorrow', label: '从明天起' },
            { value: 'today', label: '从今天起' },
          ]}
          value={timeScope}
          onChange={setTimeScope}
        />
      ) : null}
      <TextField
        label="说明"
        value={description}
        onChangeText={setDescription}
        maxLength={1200}
        multiline
        style={{ minHeight: 72, textAlignVertical: 'top' }}
      />
      {error ? (
        <AppText accessibilityRole="alert" variant="caption" color={theme.colors.danger}>
          {error}
        </AppText>
      ) : null}
      <View style={styles.actions}>
        <Button label="取消" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
        <Button label="保存修改" busy={busy} onPress={() => void save()} style={{ flex: 1 }} />
      </View>
    </ModalSheet>
  )
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' },
  templateSection: { gap: 6 },
  templateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  templateItem: { flexGrow: 1, flexBasis: 150 },
  templateCard: {
    width: '100%',
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderWidth: StyleSheet.hairlineWidth,
  },
  templateIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  templateCopy: { flex: 1, minWidth: 0, gap: 2 },
  dayChip: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  planTop: { flexDirection: 'row', gap: 8 },
  iconActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  assignmentButton: { minHeight: 44, paddingHorizontal: 10 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
})
