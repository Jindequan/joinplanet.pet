import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import type { Task } from '../../core/api/planet-api'
import { errorMessage } from '../../core/api/errors'
import { createIdempotencyKey } from '../../core/api/planet-api'
import { useFoundationWriters } from '../../core/foundation'
import { useTheme } from '../../core/providers/theme-provider'
import { useToast } from '../../core/providers/toast-provider'
import { AppText } from '../../ui/components/app-text'
import { Button } from '../../ui/components/button'
import { ModalSheet } from '../../ui/components/modal-sheet'
import { TextField } from '../../ui/components/text-field'
import { TimeField } from '../../ui/components/date-field'

type AdjustmentMode = 'move' | 'substitute'

export function ScheduleAdjustment({
  task,
  date,
  onClose,
}: {
  task: Task | null
  date: string
  onClose: () => void
}) {
  const { theme } = useTheme()
  const { showToast } = useToast()
  const foundationWriters = useFoundationWriters()
  const [mode, setMode] = useState<AdjustmentMode | null>(null)
  const [time, setTime] = useState(task?.time_of_day ?? '19:00')
  const [replacementTitle, setReplacementTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Keep one key for the same form intent. If the request committed but the
  // response was lost, retrying must replay it instead of creating a new
  // schedule override. A changed field gets a new fingerprint/key.
  const commandId = React.useRef(createIdempotencyKey())
  const commandFingerprint = React.useRef('')

  React.useEffect(() => {
    if (!task) {
      commandFingerprint.current = ''
      return
    }
    setMode(null)
    setTime(task.time_of_day ?? '19:00')
    setReplacementTitle('')
    setError('')
    commandFingerprint.current = ''
  }, [task])

  async function submit() {
    if (!task?.care_rule_id || !mode) return
    if (mode === 'move' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      setError('请选择有效时间。')
      return
    }
    if (mode === 'substitute' && !replacementTitle.trim()) {
      setError('请填写替代事项。')
      return
    }
    const payload =
      mode === 'move'
        ? { time_of_day: time }
        : { title: replacementTitle.trim(), type: 'custom', time_of_day: time }
    const fingerprint = JSON.stringify({ taskId: task.id, mode, date, payload })
    if (commandFingerprint.current !== fingerprint) {
      commandFingerprint.current = fingerprint
      commandId.current = createIdempotencyKey()
    }
    setBusy(true)
    setError('')
    try {
      await foundationWriters.applyScheduleAction({
        action: mode,
        scope: 'this',
        slot: { care_rule_id: task.care_rule_id, date },
        payload,
        idempotencyKey: commandId.current,
        petId: task.pet_id,
      })
      showToast({ message: mode === 'move' ? `已改到 ${time}` : `已换成「${replacementTitle.trim()}」` })
      onClose()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalSheet visible={Boolean(task)} onClose={onClose} busy={busy}>
      <AppText variant="eyebrow" soft>
        照护安排
      </AppText>
      <AppText variant="heading">调整「{task?.title ?? ''}」</AppText>
      <AppText muted style={{ marginBottom: 8 }}>
        只改这一次，不会改变后面的循环安排。
      </AppText>

      {!mode ? (
        <View style={styles.options}>
          <Button label="改这一次的时间" variant="secondary" onPress={() => setMode('move')} />
          <Button label="换成另一件事" variant="secondary" onPress={() => setMode('substitute')} />
          <Button label="取消" variant="ghost" onPress={onClose} />
        </View>
      ) : (
        <>
          {mode === 'move' ? (
            <TimeField label="新的时间" value={time} onChange={setTime} clearable={false} />
          ) : (
            <>
              <TextField
                label="替代事项"
                value={replacementTitle}
                onChangeText={setReplacementTitle}
                maxLength={120}
                placeholder="例如：改成在家陪它玩"
              />
              <TimeField label="时间（选填）" value={time} onChange={setTime} />
            </>
          )}
          {error ? (
            <AppText accessibilityRole="alert" variant="caption" color={theme.colors.danger}>
              {error}
            </AppText>
          ) : null}
          <View style={styles.actions}>
            <Button label="上一步" variant="secondary" onPress={() => setMode(null)} disabled={busy} style={{ flex: 1 }} />
            <Button label="确认调整" busy={busy} onPress={() => void submit()} style={{ flex: 1 }} />
          </View>
        </>
      )}
    </ModalSheet>
  )
}

const styles = StyleSheet.create({
  options: { gap: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
})
