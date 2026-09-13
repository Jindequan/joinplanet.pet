import React, { useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Users } from 'phosphor-react-native'
import { createIdempotencyKey } from '../../core/api/planet-api'
import { errorMessage } from '../../core/api/errors'
import { useExtensionWriters } from '../../core/extension'
import { invalidateAfterHandoffChange } from '../../core/foundation'
import { useCareResponsibility, type CareResponsibilityPet } from '../../core/collaboration'
import { useTheme } from '../../core/providers/theme-provider'
import { useToast } from '../../core/providers/toast-provider'
import { AppText } from '../../ui/components/app-text'
import { Button } from '../../ui/components/button'
import { Card } from '../../ui/components/card'
import { ModalSheet } from '../../ui/components/modal-sheet'
import { QueryErrorState } from '../../ui/components/query-error-state'
import { TextField } from '../../ui/components/text-field'
import { FadeInView, hapticSuccess } from '../../ui/motion'
import {
  handoffClaimDialogHint,
  handoffClaimDialogTitle,
  handoffClaimLabel,
  handoffClaimToast,
  handoffDutyLine,
  handoffNoDutyLine,
  handoffReleaseDialogHint,
  handoffReleaseDialogTitle,
  handoffReleaseLabel,
  handoffReleaseToast,
  handoffSectionTitle,
} from './copy'

type Props = {
  familyId: string
  petId?: string
}

export function HandoffStrip({ familyId, petId }: Props) {
  const { theme } = useTheme()
  const { showToast } = useToast()
  const client = useQueryClient()
  const extensionWriters = useExtensionWriters()
  const [dialog, setDialog] = useState<{ pet: CareResponsibilityPet; mode: 'claim' | 'release' } | null>(null)
  const [note, setNote] = useState('')
  const commandKey = useRef<{ scope: string; key: string } | null>(null)

  const summary = useCareResponsibility(familyId)

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
            ? handoffClaimToast(dialog?.pet.pet_name ?? '')
            : handoffReleaseToast(),
      })
      setDialog(null)
      setNote('')
    },
    onError: (error) => {
      showToast({ message: errorMessage(error) })
    },
  })

  if (summary.isLoading) return null

  // 负责人状态失败时不能伪装成没有值班安排。
  if (summary.isError) {
    return (
      <QueryErrorState
        message="照护负责人状态暂时无法更新"
        onRetry={() => void summary.refetch()}
      />
    )
  }

  let rows = summary.data?.pets ?? []
  if (petId) rows = rows.filter((row) => row.pet_id === petId)
  const visible = rows.filter((row) => row.on_duty || row.pending_today > 0)
  if (visible.length === 0) return null

  return (
    <>
      <FadeInView>
      <Card style={styles.card}>
        <View style={styles.head}>
          <Users size={18} color={theme.colors.forest2} weight="bold" />
          <AppText variant="label">{handoffSectionTitle()}</AppText>
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
                      ? handoffDutyLine(row.pet_name, duty.user_name, isMe)
                      : handoffNoDutyLine(row.pet_name)}
                  </AppText>
                  {row.pending_today > 0 ? (
                    <AppText variant="caption" muted>
                      今日还有 {row.pending_today} 项待办
                    </AppText>
                  ) : null}
                </View>
                {duty && isMe ? (
                  <Button
                    label={handoffReleaseLabel()}
                    variant="secondary"
                    onPress={() => {
                      setNote('')
                      commandKey.current = null
                      setDialog({ pet: row, mode: 'release' })
                    }}
                  />
                ) : (
                  <Button
                    label={handoffClaimLabel()}
                    variant="ghost"
                    onPress={() => {
                      setNote('')
                      commandKey.current = null
                      setDialog({ pet: row, mode: 'claim' })
                    }}
                  />
                )}
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
              ? handoffClaimDialogTitle(dialog.pet.pet_name)
              : handoffReleaseDialogTitle(dialog.pet.pet_name)}
          </AppText>
          <AppText muted style={{ marginBottom: 8 }}>
            {dialog.mode === 'claim' ? handoffClaimDialogHint() : handoffReleaseDialogHint()}
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
              label={dialog.mode === 'claim' ? handoffClaimLabel() : handoffReleaseLabel()}
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
