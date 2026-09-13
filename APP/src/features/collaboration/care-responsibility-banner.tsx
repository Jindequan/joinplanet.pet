import React, { useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Users } from 'phosphor-react-native'
import { createIdempotencyKey } from '../../core/api/planet-api'
import { errorMessage } from '../../core/api/errors'
import { useCareResponsibility } from '../../core/collaboration'
import { useExtensionWriters } from '../../core/extension'
import { invalidateAfterHandoffChange } from '../../core/foundation'
import { HANDOFF_TERMS } from '../../core/presentation/terminology'
import { useTheme } from '../../core/providers/theme-provider'
import { useToast } from '../../core/providers/toast-provider'
import { AppText } from '../../ui/components/app-text'
import { Button } from '../../ui/components/button'
import { Card } from '../../ui/components/card'
import { ModalSheet } from '../../ui/components/modal-sheet'
import { TextField } from '../../ui/components/text-field'
import { QueryErrorState } from '../../ui/components/query-error-state'
import { FadeInView, hapticSuccess } from '../../ui/motion'
import type { CareResponsibilityPet } from '../../core/collaboration/contracts'

type Props = {
  familyId: string
  petId?: string
  familyName?: string
  canParticipate?: boolean
}

export function CareResponsibilityBanner({ familyId, petId, familyName, canParticipate = true }: Props) {
  const { theme } = useTheme()
  const { showToast } = useToast()
  const client = useQueryClient()
  const extensionWriters = useExtensionWriters()
  const query = useCareResponsibility(familyId, petId)
  const [dialog, setDialog] = useState<{ pet: CareResponsibilityPet; mode: 'claim' | 'release' } | null>(null)
  const [note, setNote] = useState('')
  const commandKey = useRef<{ scope: string; key: string } | null>(null)

  const mutate = useMutation({
    mutationFn: async ({
      targetPetId,
      mode,
      noteText,
      requestKey,
    }: {
      targetPetId: string
      mode: 'claim' | 'release'
      noteText: string
      requestKey: string
    }) => {
      if (mode === 'claim') {
        return extensionWriters.claimHandoff({
          petId: targetPetId,
          note: noteText,
          idempotencyKey: requestKey,
        })
      }
      await extensionWriters.releaseHandoff(targetPetId, noteText, requestKey)
    },
    onSuccess: (_, variables) => {
      commandKey.current = null
      void hapticSuccess()
      invalidateAfterHandoffChange(client, { petId: variables.targetPetId, familyId })
      showToast({
        message:
          variables.mode === 'claim'
            ? HANDOFF_TERMS.claimToast(dialog?.pet.pet_name ?? '')
            : HANDOFF_TERMS.releaseToast,
      })
      setDialog(null)
      setNote('')
    },
    onError: (error) => {
      showToast({ message: errorMessage(error) })
    },
  })

  if (query.isLoading) return null

  // 实时负责人状态失败时不能伪装成没有需要处理的事项。
  if (query.isError) {
    return (
      <FadeInView>
        <Card style={styles.card}>
          <View style={styles.head}>
            <Users size={18} color={theme.colors.coralDark} weight="bold" />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="label">{familyName ? `${familyName} · ` : ''}负责人状态未更新</AppText>
              <AppText accessibilityRole="alert" variant="caption" muted>暂时拿不到今天的负责人安排，请重试。</AppText>
            </View>
          </View>
          <QueryErrorState
            embedded
            message="负责人状态暂时无法更新"
            onRetry={() => void query.refetch()}
          />
        </Card>
      </FadeInView>
    )
  }

  if (!query.data?.banner_visible) return null

  const visible = query.data.pets.filter(
    (row) =>
      row.show_release ||
      (row.pending_today > 0 && !row.on_duty) ||
      (row.on_duty && !row.on_duty.is_me),
  )

  if (visible.length === 0) return null

  return (
    <>
      <FadeInView>
        <Card style={styles.card}>
          <View style={styles.head}>
            <Users size={18} color={theme.colors.forest2} weight="bold" />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="label">{familyName ? `${familyName} · ` : ''}{HANDOFF_TERMS.sectionTitle}</AppText>
              <AppText variant="caption" muted>{HANDOFF_TERMS.sectionHint}</AppText>
            </View>
          </View>
          <View style={{ gap: 10 }}>
            {visible.map((row) => {
              const duty = row.on_duty
              const isMe = duty?.is_me ?? false
              return (
                <View key={row.pet_id} style={styles.row}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText variant="caption" color={theme.colors.forest2}>
                      {duty
                        ? isMe
                          ? HANDOFF_TERMS.onDutyMe(row.pet_name)
                          : HANDOFF_TERMS.onDutyOther(row.pet_name, duty.user_name)
                        : HANDOFF_TERMS.noDuty(row.pet_name)}
                    </AppText>
                    {row.pending_today > 0 ? (
                      <AppText variant="caption" muted>
                        今日还有 {row.pending_today} 项待办
                      </AppText>
                    ) : null}
                  </View>
                  {canParticipate && row.show_release ? (
                    <Button
                      label={HANDOFF_TERMS.release}
                      variant="secondary"
                      onPress={() => {
                        setNote('')
                        commandKey.current = null
                        setDialog({ pet: row, mode: 'release' })
                      }}
                    />
                  ) : canParticipate && row.show_claim ? (
                    <Button
                      label={HANDOFF_TERMS.claim}
                      variant="ghost"
                      onPress={() => {
                        setNote('')
                        commandKey.current = null
                        setDialog({ pet: row, mode: 'claim' })
                      }}
                    />
                  ) : null}
                </View>
              )
            })}
          </View>
        </Card>
      </FadeInView>

      {dialog ? (
        <ModalSheet
          visible
          onClose={() => {
            commandKey.current = null
            setDialog(null)
          }}
          busy={mutate.isPending}
        >
          <AppText variant="heading">
            {dialog.mode === 'claim'
              ? `${HANDOFF_TERMS.claim} · ${dialog.pet.pet_name}`
              : `${HANDOFF_TERMS.release} · ${dialog.pet.pet_name}`}
          </AppText>
          <AppText muted style={{ marginBottom: 8 }}>
            {dialog.mode === 'claim'
              ? '成员会看到今天由你照看；遛狗、喂药等具体事情会单独列出来。'
              : '可以留一句话给其他成员；还没做的事情会继续出现在清单里。'}
          </AppText>
          <TextField
            label="备注（选填）"
            value={note}
            onChangeText={setNote}
            maxLength={500}
            editable={!mutate.isPending}
            multiline
          />
          <View style={styles.actions}>
            <Button
              label="取消"
              variant="secondary"
              onPress={() => {
                commandKey.current = null
                setDialog(null)
              }}
              style={{ flex: 1 }}
            />
            <Button
              label={dialog.mode === 'claim' ? HANDOFF_TERMS.claim : HANDOFF_TERMS.release}
              busy={mutate.isPending}
              style={{ flex: 1 }}
              onPress={() =>
                (() => {
                  const scope = `${dialog.mode}:${dialog.pet.pet_id}:${note.trim()}`
                  const requestKey =
                    commandKey.current?.scope === scope
                      ? commandKey.current.key
                      : createIdempotencyKey()
                  commandKey.current = { scope, key: requestKey }
                  mutate.mutate({
                    targetPetId: dialog.pet.pet_id,
                    mode: dialog.mode,
                    noteText: note.trim(),
                    requestKey,
                  })
                })()
              }
            />
          </View>
        </ModalSheet>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
})
