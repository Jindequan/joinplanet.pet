import React, { useRef, useState } from 'react'
import { StyleSheet, Switch, View } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import {
  createIdempotencyKey,
  planetApi,
  type Pet,
  type Profile,
} from '../../core/api/planet-api'
import { errorMessage } from '../../core/api/errors'
import { queryKeys } from '../../core/query/keys'
import { invalidateAfterPetChange } from '../../core/foundation'
import { useTheme } from '../../core/providers/theme-provider'
import { useToast } from '../../core/providers/toast-provider'
import { AppText } from '../../ui/components/app-text'
import { BackHeader } from '../../ui/components/back-header'
import { Button } from '../../ui/components/button'
import { ChoiceChips } from '../../ui/components/choice-chips'
import { DateField } from '../../ui/components/date-field'
import { LoadingState } from '../../ui/components/loading-state'
import { QueryErrorState } from '../../ui/components/query-error-state'
import { Screen } from '../../ui/components/screen'
import { TextField } from '../../ui/components/text-field'
import { FadeInView, hapticSuccess } from '../../ui/motion'
import {
  profileContactRows,
  profileContactRowsPayload,
  profileLines,
  profileLinesPayload,
  profileObjectName,
} from './profile-helpers'
import { SpeciesPicker } from './species-picker'

const SEX: Array<{ value: Pet['sex']; label: string }> = [
  { value: '', label: '未设置' },
  { value: 'female', label: '母' },
  { value: 'male', label: '公' },
]

export function PetEditScreen({ petId, familyId }: { petId: string; familyId?: string }) {
  const petQuery = useQuery({
    queryKey: queryKeys.pet(petId),
    queryFn: () => planetApi.pets.get(petId),
    enabled: Boolean(petId),
  })

  if (petQuery.isLoading) {
    return (
      <Screen>
        <BackHeader title="编辑" fallbackHref={`/pets/${petId}${familyId ? `?familyId=${encodeURIComponent(familyId)}` : ''}`} />
        <LoadingState label="正在加载宠物档案" />
      </Screen>
    )
  }
  if (petQuery.error || !petQuery.data) {
    return (
      <Screen>
        <BackHeader title="编辑" fallbackHref={`/pets/${petId}${familyId ? `?familyId=${encodeURIComponent(familyId)}` : ''}`} />
        <QueryErrorState
          error={petQuery.error}
          message={petQuery.error ? undefined : '宠物不可见'}
          onRetry={() => void petQuery.refetch()}
        />
      </Screen>
    )
  }

  return (
    <PetEditForm
      pet={petQuery.data.pet}
      profile={petQuery.data.profile}
      familyId={familyId}
      onSaved={() => {
        void petQuery.refetch()
        if (router.canGoBack()) router.back()
        else router.replace(`/pets/${petId}${familyId ? `?familyId=${encodeURIComponent(familyId)}` : ''}` as never)
      }}
    />
  )
}

function PetEditForm({
  pet,
  profile,
  familyId,
  onSaved,
}: {
  pet: Pet
  profile: Profile
  familyId?: string
  onSaved: () => void
}) {
  const { theme } = useTheme()
  const { showToast } = useToast()
  const client = useQueryClient()
  const [name, setName] = useState(pet.name)
  const [species, setSpecies] = useState(pet.species)
  const [breed, setBreed] = useState(pet.breed)
  const [sex, setSex] = useState(pet.sex)
  const [birthDate, setBirthDate] = useState(pet.birth_date ?? '')
  const [neutered, setNeutered] = useState(pet.neutered)
  const [notes, setNotes] = useState(profile.notes)
  const [allergies, setAllergies] = useState(profileLines(profile.allergies, 'name'))
  const [conditions, setConditions] = useState(profileLines(profile.conditions, 'name'))
  const [emergencyContacts, setEmergencyContacts] = useState(
    profileContactRows(profile.emergency_contacts),
  )
  const [decisionMaker, setDecisionMaker] = useState(
    profileObjectName(profile.med_decision_maker),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const commandId = useRef(createIdempotencyKey())

  async function save() {
    if (!name.trim()) {
      setError('名字不能为空。')
      return
    }
    setBusy(true)
    setError('')
    try {
      await planetApi.pets.updateRecord(
        pet.id,
        {
          name: name.trim(),
          species,
          breed,
          sex,
          birth_date: birthDate,
          neutered,
          notes,
          allergies: profileLinesPayload(allergies),
          conditions: profileLinesPayload(conditions),
          emergency_contacts: profileContactRowsPayload(emergencyContacts),
          med_decision_maker: decisionMaker.trim()
            ? { name: decisionMaker.trim() }
            : null,
          version: pet.version,
        },
        commandId.current,
      )
      commandId.current = createIdempotencyKey()
      invalidateAfterPetChange(client, pet.id)
      void hapticSuccess()
      showToast({ message: '已保存' })
      onSaved()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <BackHeader
        title={pet.name}
        subtitle="档案与健康信息"
        fallbackHref={`/pets/${pet.id}${familyId ? `?familyId=${encodeURIComponent(familyId)}` : ''}`}
      />

      <FadeInView index={0}>
        <View style={{ gap: 14 }}>
          <AppText variant="eyebrow" soft>
            基本档案
          </AppText>
          <TextField label="名字" value={name} onChangeText={setName} maxLength={60} />
          <SpeciesPicker value={species} onChange={setSpecies} />
          <ChoiceChips label="性别" options={SEX} value={sex} onChange={setSex} />
          <TextField label="品种" value={breed} onChangeText={setBreed} maxLength={80} />
          <DateField
            label="出生日期"
            value={birthDate}
            onChange={setBirthDate}
            placeholder="未设置（用于计算年龄）"
            maximumDate={new Date()}
          />
          <View style={styles.toggleRow}>
            <AppText variant="label">已绝育</AppText>
            <Switch
              value={neutered}
              onValueChange={setNeutered}
              trackColor={{ true: theme.colors.mintStrong, false: theme.colors.line }}
            />
          </View>
        </View>
      </FadeInView>

      <FadeInView index={1}>
        <View style={{ gap: 14, marginTop: 10 }}>
          <AppText variant="eyebrow" soft>
            健康档案
          </AppText>
          <TextField
            label="备注"
            value={notes}
            onChangeText={setNotes}
            maxLength={1200}
            multiline
            style={{ minHeight: 72, textAlignVertical: 'top' }}
          />
          <TextField
            label="过敏（选填，每条一行）"
            value={allergies}
            onChangeText={setAllergies}
            maxLength={1200}
            multiline
            style={{ minHeight: 64, textAlignVertical: 'top' }}
          />
          <TextField
            label="疾病（选填，每条一行）"
            value={conditions}
            onChangeText={setConditions}
            maxLength={1200}
            multiline
            style={{ minHeight: 64, textAlignVertical: 'top' }}
          />
          {emergencyContacts.map((contact, index) => (
            <View key={`contact-${index}`} style={{ gap: 8 }}>
              <TextField
                label={index === 0 ? '紧急联系人姓名' : `联系人 ${index + 1}`}
                value={contact.name}
                maxLength={80}
                onChangeText={(value) =>
                  setEmergencyContacts((current) =>
                    current.map((row, rowIndex) =>
                      rowIndex === index ? { ...row, name: value } : row,
                    ),
                  )
                }
              />
              <TextField
                label="电话"
                value={contact.phone}
                maxLength={40}
                onChangeText={(value) =>
                  setEmergencyContacts((current) =>
                    current.map((row, rowIndex) =>
                      rowIndex === index ? { ...row, phone: value } : row,
                    ),
                  )
                }
                keyboardType="phone-pad"
              />
              {emergencyContacts.length > 1 ? (
                <Button
                  label="移除这位"
                  variant="ghost"
                  onPress={() =>
                    setEmergencyContacts((current) =>
                      current.filter((_, rowIndex) => rowIndex !== index),
                    )
                  }
                />
              ) : null}
            </View>
          ))}
          <Button
            label="再加一位联系人"
            variant="ghost"
            onPress={() =>
              setEmergencyContacts((current) => [...current, { name: '', phone: '' }])
            }
          />
          <TextField label="用药决策人" value={decisionMaker} onChangeText={setDecisionMaker} maxLength={80} />

          {error ? (
            <AppText accessibilityRole="alert" variant="caption" color={theme.colors.danger}>
              {error}
            </AppText>
          ) : null}
          <Button
            label="保存修改"
            full
            busy={busy}
            disabled={!name.trim()}
            onPress={() => void save()}
            style={styles.submit}
          />
        </View>
      </FadeInView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  submit: { marginTop: 8, marginBottom: 24 },
})
