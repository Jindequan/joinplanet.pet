import React, { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Warning } from 'phosphor-react-native'
import { errorMessage } from '../../core/api/errors'
import { useTheme } from '../../core/providers/theme-provider'
import { AppText } from './app-text'
import { Button } from './button'
import { ModalSheet } from './modal-sheet'
import { TextField } from './text-field'

type Props = {
  visible: boolean
  title: string
  consequence: string
  confirmLabel: string
  requireText?: string
  onCancel: () => void
  onConfirm: () => Promise<void> | void
}

export function ConfirmDialog({
  visible,
  title,
  consequence,
  confirmLabel,
  requireText,
  onCancel,
  onConfirm,
}: Props) {
  const { theme } = useTheme()
  const [busy, setBusy] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  const valid = !requireText || value.trim() === requireText

  useEffect(() => {
    if (!visible) {
      setValue('')
      setError('')
      setBusy(false)
    }
  }, [visible])

  async function confirm() {
    setBusy(true)
    setError('')
    try {
      await onConfirm()
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setBusy(false)
    }
  }

  function handleCancel() {
    if (busy) return
    setValue('')
    setError('')
    onCancel()
  }

  return (
    <ModalSheet visible={visible} onClose={handleCancel} busy={busy}>
      <View style={[styles.iconWrap, { backgroundColor: theme.colors.coralSoft }]}>
        <Warning size={24} color={theme.colors.danger} weight="bold" />
      </View>
      <AppText variant="eyebrow" muted style={styles.eyebrow}>
        请再次确认
      </AppText>
      <AppText variant="heading">{title}</AppText>
      <AppText variant="body" muted style={styles.consequence}>
        {consequence}
      </AppText>
      {requireText ? (
        <TextField
          label={`输入 “${requireText}” 以继续`}
          value={value}
          onChangeText={setValue}
          maxLength={requireText?.length}
          editable={!busy}
          autoCapitalize="none"
          autoCorrect={false}
        />
      ) : null}
      {error ? (
        <AppText variant="caption" color={theme.colors.danger} accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
      <View style={styles.actions}>
        <Button
          label="取消"
          variant="secondary"
          onPress={handleCancel}
          disabled={busy}
          style={styles.actionBtn}
        />
        <Button
          label={confirmLabel}
          variant="danger"
          busy={busy}
          disabled={!valid}
          onPress={() => void confirm()}
          style={styles.actionBtn}
        />
      </View>
    </ModalSheet>
  )
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  eyebrow: {
    marginBottom: 4,
  },
  consequence: {
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  actionBtn: {
    flex: 1,
  },
})
