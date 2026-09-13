import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Check } from 'phosphor-react-native'
import { router } from 'expo-router'
import { useActivation } from '../../core/activation'
import { useTheme } from '../../core/providers/theme-provider'
import { AppText } from '../../ui/components/app-text'
import { Button } from '../../ui/components/button'
import { FadeInView, PressableScale } from '../../ui/motion'

type Props = {
  familyCount: number
  petCount: number
  firstPetId?: string
  familyId?: string
  canManagePet?: boolean
  canManageCare?: boolean
  familyHref?: string
}

export function SetupJourney({
  familyCount,
  petCount,
  firstPetId,
  familyId,
  canManagePet = true,
  canManageCare = true,
  familyHref = '/families',
}: Props) {
  const { theme } = useTheme()
  const { summary } = useActivation()
  const hasFamily = familyCount > 0
  const hasPet = petCount > 0
  const careDone =
    (summary?.pets_with_active_plans ?? 0) > 0 || Boolean(summary?.has_today_items)

  const currentKey = !hasFamily ? 'family' : !hasPet ? 'pet' : 'care'
  const addPetHref = familyId
    ? `/pets/new?guided=1&family_id=${encodeURIComponent(familyId)}`
    : '/pets/new?guided=1'
  // The guided first run already has a separate invite action below. Make
  // the primary path create the user's own family directly instead of
  // sending a brand-new user through an extra family listing screen.
  const canCreatePet = !hasFamily || canManagePet
  const canCreateCare = !hasPet || canManageCare
  const currentHref = !hasFamily
    ? '/families/new'
    : !hasPet
      ? canCreatePet ? addPetHref : familyHref
      : firstPetId && canCreateCare
        ? `/pets/${firstPetId}/care?setup=1${familyId ? `&familyId=${encodeURIComponent(familyId)}` : ''}`
        : familyHref
  const currentLabel = !hasFamily
    ? '创建家庭'
    : !hasPet
      ? canCreatePet ? '添加宠物' : '去家庭管理'
      : canCreateCare ? '选一项照护' : '去家庭管理'

  const steps = [
    {
      key: 'family',
      number: '1',
      title: '家庭',
      detail: '新建或加入家庭，成员才能看到同一份清单。',
      done: hasFamily,
    },
    {
      key: 'pet',
      number: '2',
      title: '宠物',
      detail: hasPet
        ? '宠物已经加入，下一步设置一条日常安排。'
        : canCreatePet
          ? '给它起个名字，之后的记录都会归到这里。'
          : '需要家庭管理员添加宠物。',
      done: hasPet,
    },
    {
      key: 'care',
      number: '3',
      title: '照护',
      detail: careDone
        ? '今天页已经有照护事项。'
        : canCreateCare
          ? '选一条日常安排，今天就会显示待办。'
          : '需要家庭管理员设置照护计划。',
      done: careDone,
    },
  ] as const

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 6 }}>
        <AppText variant="eyebrow" soft>
          开始
        </AppText>
        <AppText variant="title">先把今天的照护安排好</AppText>
        <AppText muted>完成后，今天的待办会直接显示在这里。</AppText>
      </View>

      <View style={{ gap: 8 }}>
        {steps.map((step, index) => {
          const current = step.key === currentKey && !step.done
          const locked = (step.key === 'pet' && !hasFamily) || (step.key === 'care' && !hasPet)
          return (
            <FadeInView key={step.key} index={index}>
              <View
                style={[
                  styles.step,
                  theme.shadow.card,
                  {
                    backgroundColor: current ? theme.colors.paperStrong : theme.colors.sageSoft,
                    borderColor: current ? theme.colors.forest2 : theme.colors.line,
                    borderRadius: theme.radius.lg,
                    opacity: locked ? 0.45 : 1,
                  },
                ]}
              >
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: step.done ? theme.colors.mint : theme.colors.sageSoft,
                    },
                  ]}
                >
                  {step.done ? (
                    <Check size={16} color={theme.colors.forest2} weight="bold" />
                  ) : (
                    <AppText variant="caption" color={theme.colors.forest2}>
                      {step.number}
                    </AppText>
                  )}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="label">{step.title}</AppText>
                  <AppText variant="caption" muted>
                    {step.detail}
                  </AppText>
                </View>
              </View>
            </FadeInView>
          )
        })}
      </View>

      <Button
        label={currentLabel}
        full
        onPress={() => router.push(currentHref as never)}
      />

      {!hasFamily ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="我有邀请码"
          onPress={() => router.push('/families/join' as never)}
          style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'center' }}
        >
          <AppText variant="caption" color={theme.colors.forest2}>
            我有邀请码
          </AppText>
        </PressableScale>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
