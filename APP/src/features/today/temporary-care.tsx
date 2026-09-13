import React, { useState } from 'react'
import { View } from 'react-native'
import { Plus, PawPrint } from 'phosphor-react-native'
import type { Family, Pet } from '../../core/api/planet-api'
import { createIdempotencyKey } from '../../core/api/planet-api'
import { errorMessage } from '../../core/api/errors'
import { useFoundationWriters } from '../../core/foundation'
import { useTheme } from '../../core/providers/theme-provider'
import { useToast } from '../../core/providers/toast-provider'
import { AppText } from '../../ui/components/app-text'
import { Button } from '../../ui/components/button'
import { ModalSheet } from '../../ui/components/modal-sheet'
import { SelectField, OptionSheet } from '../../ui/components/option-sheet'
import { TextField } from '../../ui/components/text-field'
import { TimeField } from '../../ui/components/date-field'
import { PressableScale } from '../../ui/motion'

export function TemporaryCare({
  pets,
  families,
  date,
  dateLabel,
  defaultPetId,
  defaultFamilyId,
  writableFamilyIdsByPet,
  trigger,
}: {
  pets: Pet[]
  families: Family[]
  date: string
  dateLabel?: string
  defaultPetId?: string
  defaultFamilyId?: string
  writableFamilyIdsByPet?: Record<string, string[]>
  trigger?: React.ReactNode
}) {
  const { theme } = useTheme()
  const { showToast } = useToast()
  const foundationWriters = useFoundationWriters()
  const [visible, setVisible] = useState(false)
  const [petPicker, setPetPicker] = useState(false)
  const [familyPicker, setFamilyPicker] = useState(false)
  const [petId, setPetId] = useState(defaultPetId ?? (pets.length === 1 ? pets[0]?.id ?? '' : ''))
  const [familyId, setFamilyId] = useState(() => familyForPet(defaultPetId ?? (pets.length === 1 ? pets[0]?.id ?? '' : '')))
  const [title, setTitle] = useState('')
  const [time, setTime] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // A timeout after a committed add must replay the same command. Generate a
  // new key only when the user changes the actual add intent.
  const commandId = React.useRef(createIdempotencyKey())
  const commandFingerprint = React.useRef('')

  function familyForPet(nextPetId: string) {
    const ids = pets.find((pet) => pet.id === nextPetId)?.family_ids ?? []
    const writableIds = writableFamilyIdsByPet?.[nextPetId] ?? ids
    if (defaultFamilyId && writableIds.includes(defaultFamilyId)) return defaultFamilyId
    return writableIds.length === 1 ? writableIds[0] ?? '' : ''
  }

  function open() {
    const nextPetId = defaultPetId ?? (pets.length === 1 ? pets[0]?.id ?? '' : '')
    setPetId(nextPetId)
    setFamilyId(familyForPet(nextPetId))
    setTitle('')
    setTime('')
    setError('')
    commandId.current = createIdempotencyKey()
    commandFingerprint.current = ''
    setVisible(true)
  }

  async function submit() {
    if (!petId) {
      setError('请先选择宠物。')
      return
    }
    if (!title.trim()) {
      setError('请填写要做的事。')
      return
    }
    const familyIds = selectedPet?.family_ids ?? []
    if (familyIds.length > 1 && !familyId) {
      setError('请先选择这次照护归属的家庭。')
      return
    }
    const writableIds = writableFamilyIdsByPet?.[petId] ?? familyIds
    if (familyId && !writableIds.includes(familyId)) {
      setError('所选家庭已不能安排这次照护。')
      return
    }
    const payload = {
      pet_id: petId,
      title: title.trim(),
      type: 'custom',
      date,
      time_of_day: time,
      ...(familyId ? { family_id: familyId } : {}),
    }
    const fingerprint = JSON.stringify(payload)
    if (commandFingerprint.current !== fingerprint) {
      commandFingerprint.current = fingerprint
      commandId.current = createIdempotencyKey()
    }
    setBusy(true)
    setError('')
    try {
      await foundationWriters.applyScheduleAction({
        action: 'add',
        scope: 'this',
        payload,
        idempotencyKey: commandId.current,
        petId,
      })
      showToast({ message: '已加入今天的清单' })
      setVisible(false)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const selectedPet = pets.find((pet) => pet.id === petId)
  const writableIds = writableFamilyIdsByPet?.[petId] ?? selectedPet?.family_ids ?? []
  const familyOptions = families.filter((family) => writableIds.includes(family.id))
  const familyRequired = (selectedPet?.family_ids?.length ?? 0) > 1
  const selectedFamily = familyOptions.find((family) => family.id === familyId)

  return (
    <>
      {trigger ? React.cloneElement(trigger as React.ReactElement<{ onPress?: () => void }>, { onPress: open }) : (
        <PressableScale
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel="安排一次照护"
          style={[
            styles.entry,
            {
              borderColor: theme.colors.lineStrong,
              backgroundColor: theme.colors.paper,
            },
          ]}
        >
          <Plus size={17} color={theme.colors.forest2} weight="bold" />
          <AppText variant="label" color={theme.colors.forest2}>
            安排一次照护
          </AppText>
        </PressableScale>
      )}

      <ModalSheet visible={visible} onClose={() => setVisible(false)} busy={busy}>
        <AppText variant="eyebrow" soft>
          {dateLabel ?? '今天的照护'}
        </AppText>
        <AppText variant="heading">安排一次照护</AppText>
        <AppText muted style={{ marginBottom: 8 }}>
          只影响所选日期，不会改变周期安排。
        </AppText>
        {pets.length > 1 ? (
          <SelectField
            label="宠物"
            value={selectedPet?.name ?? '选择宠物'}
            onPress={() => setPetPicker(true)}
          />
        ) : (
          <View style={styles.petLine}>
            <PawPrint size={17} color={theme.colors.forest2} weight="bold" />
            <AppText variant="label">{selectedPet?.name ?? '选择宠物'}</AppText>
          </View>
        )}
        {familyRequired ? (
          <SelectField
            label="家庭"
            value={selectedFamily?.name ?? '选择家庭'}
            onPress={() => setFamilyPicker(true)}
          />
        ) : null}
        <TextField
          label="要做的事"
          value={title}
          onChangeText={setTitle}
          maxLength={120}
          placeholder="例如：陪它玩十分钟"
          editable={!busy}
        />
        <TimeField label="时间（选填）" value={time} onChange={setTime} />
        {error ? (
          <AppText accessibilityRole="alert" variant="caption" color={theme.colors.danger}>
            {error}
          </AppText>
        ) : null}
        <View style={styles.actions}>
          <Button label="取消" variant="secondary" onPress={() => setVisible(false)} disabled={busy} style={{ flex: 1 }} />
          <Button
            label={dateLabel === '今天的照护' || !dateLabel ? '加入今天' : `加入 ${date}`}
            busy={busy}
            onPress={() => void submit()}
            style={{ flex: 1 }}
          />
        </View>
      </ModalSheet>

      <OptionSheet
        visible={petPicker}
        title="选择宠物"
        options={pets.map((pet) => ({ value: pet.id, label: pet.name }))}
        selected={petId}
        onClose={() => setPetPicker(false)}
        onSelect={(value) => {
          setPetId(value)
          setFamilyId(familyForPet(value))
          setPetPicker(false)
        }}
      />

      <OptionSheet
        visible={familyPicker}
        title="选择家庭"
        options={familyOptions.map((family) => ({ value: family.id, label: family.name }))}
        selected={familyId}
        onClose={() => setFamilyPicker(false)}
        onSelect={(value) => {
          setFamilyId(value)
          setFamilyPicker(false)
        }}
      />
    </>
  )
}

const styles = {
  entry: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 14,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
  },
  petLine: {
    minHeight: 48,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  actions: {
    flexDirection: 'row' as const,
    gap: 10,
    marginTop: 8,
  },
}
