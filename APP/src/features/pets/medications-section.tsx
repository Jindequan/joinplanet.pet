import React, { useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createIdempotencyKey,
  planetApi,
  type Medication,
  type Pet,
} from '../../core/api/planet-api'
import { errorMessage } from '../../core/api/errors'
import { queryKeys } from '../../core/query/keys'
import { resolvePetTimezone, useScope } from '../../core/providers/scope-provider'
import { invalidateAfterMedicationChange } from '../../core/foundation'
import { civilDateInTimezone } from '../../core/time/civil'
import { useTheme } from '../../core/providers/theme-provider'
import { useToast } from '../../core/providers/toast-provider'
import { AppText } from '../../ui/components/app-text'
import { Button } from '../../ui/components/button'
import { Card } from '../../ui/components/card'
import { ConfirmDialog } from '../../ui/components/confirm-dialog'
import { EmptyState } from '../../ui/components/empty-state'
import { LoadingState } from '../../ui/components/loading-state'
import { ModalSheet } from '../../ui/components/modal-sheet'
import { TextField } from '../../ui/components/text-field'
import { FadeInView, hapticSuccess } from '../../ui/motion'

export function MedicationsSection({ pet, timezone: selectedTimezone, familyId, timezoneAmbiguous = false, timezoneUnavailable = false, readOnly = false, canManageRecords = false }: { pet: Pet; timezone?: string; familyId?: string; timezoneAmbiguous?: boolean; timezoneUnavailable?: boolean; readOnly?: boolean; canManageRecords?: boolean }) {
  const { theme } = useTheme()
  const { showToast } = useToast()
  const client = useQueryClient()
  const query = useQuery({
    queryKey: queryKeys.medications(pet.id),
    queryFn: () => planetApi.pets.medications(pet.id),
  })
  const families = useQuery({
    queryKey: queryKeys.families,
    queryFn: () => planetApi.families.list(),
  })
  const preferences = useQuery({
    queryKey: queryKeys.preferences,
    queryFn: () => planetApi.me.preferences(),
  })
  const { scope } = useScope()
  const [editing, setEditing] = useState<Medication | null>(null)
  const [deleting, setDeleting] = useState<Medication | null>(null)
  const [confirmStopId, setConfirmStopId] = useState('')

  const preferredFamilyId = scope.type === 'family'
    ? scope.id
    : preferences.data?.preferences.default_family_id
  const timezone = selectedTimezone ?? resolvePetTimezone(pet.family_ids, families.data?.families ?? [], preferredFamilyId)

  function invalidate() {
    invalidateAfterMedicationChange(client, pet.id)
  }

  if (query.isLoading) {
    return <LoadingState label="正在加载用药记录" />
  }
  if (query.error) {
    return (
      <Card>
        <AppText accessibilityRole="alert" color={theme.colors.danger}>{errorMessage(query.error)}</AppText>
        <Button label="重试" onPress={() => void query.refetch()} style={{ marginTop: 10 }} />
      </Card>
    )
  }

  const meds = [...(query.data?.medications ?? [])].sort((a, b) =>
    (b.started_on || '').localeCompare(a.started_on || ''),
  )

  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 4 }}>
        <AppText variant="heading">用药史</AppText>
        <AppText muted>
          记药名、剂量和起止。每天要出现在今天里的给药，在上方建一条「定点给药」计划。
          {pet.archived_at
            ? ' 该档案已归档，不能修改。'
            : !canManageRecords && !readOnly
              ? ' 你可以查看记录，修改由宠物档案管理员处理。'
              : ''}
        </AppText>
      </View>

      {!pet.archived_at && canManageRecords ? (
        <FadeInView index={0}>
        <MedQuickAdd
          petId={pet.id}
          familyId={familyId}
          disabled={timezoneAmbiguous || timezoneUnavailable}
          onSaved={(name) => {
            void hapticSuccess()
            showToast({ message: `已开始记录「${name}」。` })
            invalidate()
          }}
        />
        </FadeInView>
      ) : null}

      {meds.length === 0 ? (
        <EmptyState
          title="还没有用药阶段"
          description={canManageRecords ? '上面输入药名就能开始一段记录；停用时点一下，历史自动串成用药史。' : '宠物档案管理员添加用药后，这里会显示药名、剂量和起止。'}
        />
      ) : (
        <View style={{ gap: 10 }}>
          {meds.map((med, index) => {
            const ongoing = !med.ended_on
            return (
              <FadeInView key={med.id} index={index + 1}>
              <Card style={{ gap: 8 }}>
                <View style={styles.topline}>
                  <AppText variant="heading" style={{ flex: 1 }}>
                    {med.name}
                  </AppText>
                  <AppText variant="caption" soft>
                    {ongoing ? `使用中 · ${medDuration(med)}` : medDuration(med)}
                  </AppText>
                </View>
                {med.dose || med.schedule ? (
                  <AppText muted>
                    {[med.dose, med.schedule].filter(Boolean).join(' · ')}
                  </AppText>
                ) : null}
                {med.note ? <AppText variant="caption">{med.note}</AppText> : null}
                <AppText variant="caption" soft>
                  {medDay(med.started_on)} 开始
                  {med.ended_on ? ` → ${medDay(med.ended_on)} 结束` : ''}
                </AppText>
                {canManageRecords ? <View style={styles.rowActions}>
                  {ongoing ? (
                    confirmStopId === med.id ? (
                      <>
                          <Button
                            label="确认停用"
                            variant="danger"
                            disabled={timezoneAmbiguous}
                          onPress={async () => {
                            try {
                              await planetApi.medications.stop(
                                med.id,
                                civilDateInTimezone(timezone),
                                familyId,
                              )
                              setConfirmStopId('')
                              showToast({ message: `「${med.name}」已停用，用药史保留。` })
                              await invalidate()
                            } catch (e) {
                              showToast({ message: errorMessage(e) })
                            }
                          }}
                        />
                        <Button
                          label="取消"
                          variant="ghost"
                          onPress={() => setConfirmStopId('')}
                        />
                      </>
                    ) : (
                      <Button
                        label="停用"
                        variant="ghost"
                        disabled={timezoneAmbiguous}
                        onPress={() => setConfirmStopId(med.id)}
                      />
                    )
                  ) : null}
                  <Button
                    label="补充细节"
                    variant="ghost"
                    onPress={() => setEditing(med)}
                  />
                  <Button
                    label="删除"
                    variant="ghost"
                    onPress={() => setDeleting(med)}
                  />
                </View> : null}
              </Card>
              </FadeInView>
            )
          })}
        </View>
      )}

      {editing ? (
        <MedicationForm
          visible
          petId={pet.id}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            showToast({ message: '档案已更新。' })
            invalidate()
          }}
        />
      ) : null}

      <ConfirmDialog
        visible={Boolean(deleting)}
        title={`删除「${deleting?.name ?? ''}」？`}
        consequence="这是错误数据的清理，会连同它产生的用药事件一起删除。"
        confirmLabel="删除药物"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return
          await planetApi.medications.delete(deleting.id)
          setDeleting(null)
          showToast({ message: '错误档案已删除。' })
          await invalidate()
        }}
      />
    </View>
  )
}

function MedQuickAdd({
  petId,
  familyId,
  disabled = false,
  onSaved,
}: {
  petId: string
  familyId?: string
  disabled?: boolean
  onSaved: (name: string) => void
}) {
  const { theme } = useTheme()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const commandId = useRef(createIdempotencyKey())

  async function save() {
    if (!name.trim() || busy) {
      setError(name.trim() ? '' : '先写个药名')
      return
    }
    setBusy(true)
    setError('')
    try {
      await planetApi.pets.createMedication(
        petId,
        {
          name: name.trim(),
          dose: '',
          schedule: '',
          note: '',
          ...(familyId ? { family_id: familyId } : {}),
        },
        commandId.current,
      )
      const saved = name.trim()
      setName('')
      commandId.current = createIdempotencyKey()
      onSaved(saved)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card style={{ gap: 10 }}>
      <TextField
        label="药名"
        value={name}
        onChangeText={setName}
        maxLength={120}
        placeholder="开始一段用药：输入药名"
        onSubmitEditing={() => void save()}
        editable={!disabled}
        returnKeyType="done"
      />
      {error ? (
        <AppText accessibilityRole="alert" variant="caption" color={theme.colors.danger}>
          {error}
        </AppText>
      ) : null}
      <View style={styles.quickFoot}>
        <AppText variant="caption" soft style={{ flex: 1 }}>
          现在开始记，结束点一下「停用」。
        </AppText>
        <Button label="开始记录" busy={busy} disabled={disabled} onPress={() => void save()} />
      </View>
    </Card>
  )
}

export function MedicationForm({
  visible,
  petId,
  initial,
  onClose,
  onSaved,
}: {
  visible: boolean
  petId: string
  initial?: Medication
  onClose: () => void
  onSaved: () => void
}) {
  const { theme } = useTheme()
  const [name, setName] = useState(initial?.name ?? '')
  const [dose, setDose] = useState(initial?.dose ?? '')
  const [schedule, setSchedule] = useState(initial?.schedule ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const commandId = useRef(createIdempotencyKey())

  async function save() {
    if (!name.trim()) {
      setError('请填写药名。')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (initial) {
        await planetApi.medications.update(initial.id, {
          name: name.trim(),
          dose: dose.trim(),
          schedule: schedule.trim(),
          note: note.trim(),
        })
      } else {
        await planetApi.pets.createMedication(
          petId,
          { name: name.trim(), dose: dose.trim(), schedule: schedule.trim(), note: note.trim() },
          commandId.current,
        )
      }
      commandId.current = createIdempotencyKey()
      onSaved()
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalSheet visible={visible} onClose={onClose} busy={busy}>
      <AppText variant="eyebrow" soft>
        用药
      </AppText>
      <AppText variant="heading">{initial ? `编辑 ${initial.name}` : '添加药物'}</AppText>
      <TextField label="药名" value={name} onChangeText={setName} maxLength={120} autoFocus />
      <TextField label="剂量" value={dose} onChangeText={setDose} maxLength={120} placeholder="1 片 / 5 ml" />
      <TextField
        label="频率"
        value={schedule}
        onChangeText={setSchedule}
        maxLength={200}
        placeholder="每日 2 次 · 随餐"
      />
      <TextField
        label="备注"
        value={note}
        onChangeText={setNote}
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
        <Button
          label={initial ? '保存修改' : '添加药物'}
          busy={busy}
          disabled={!name.trim()}
          onPress={() => void save()}
          style={{ flex: 1 }}
        />
      </View>
    </ModalSheet>
  )
}

function medDay(value: string | undefined): string {
  if (!value) return ''
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  const now = new Date()
  const sameYear = parsed.getFullYear() === now.getFullYear()
  const md = `${parsed.getMonth() + 1}月${parsed.getDate()}日`
  return sameYear ? md : `${parsed.getFullYear()}年${md}`
}

function medDuration(med: Medication): string {
  if (!med.started_on) return ''
  const start = new Date(`${med.started_on}T00:00:00`)
  const end = med.ended_on ? new Date(`${med.ended_on}T00:00:00`) : new Date()
  if (Number.isNaN(start.getTime())) return ''
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1)
  return med.ended_on ? `共 ${days} 天` : `已用 ${days} 天`
}

const styles = StyleSheet.create({
  topline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingTop: 4 },
  twoCol: { flexDirection: 'row', gap: 10 },
  quickFoot: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
})
