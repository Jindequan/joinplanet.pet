import React from 'react'
import { StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { CaretRight } from 'phosphor-react-native'
import { useTheme } from '../../core/providers/theme-provider'
import { useScope } from '../../core/providers/scope-provider'
import { AppText } from '../../ui/components/app-text'
import { PressableScale } from '../../ui/motion'

type Props = {
  petId: string
  petName: string
  familyId?: string
  pendingCount: number
}

export function PendingCareBanner({ petId, petName, familyId, pendingCount }: Props) {
  const { theme } = useTheme()
  const { setScope } = useScope()

  if (pendingCount <= 0) return null

  return (
    <PressableScale
      onPress={() => {
        setScope({ type: 'pet', id: petId, ...(familyId ? { familyId } : {}) })
        router.push(`/(tabs)?pet_id=${encodeURIComponent(petId)}${familyId ? `&family_id=${encodeURIComponent(familyId)}` : ''}` as never)
      }}
      accessibilityRole="button"
      accessibilityLabel={`打开 Today，处理 ${petName} 的 ${pendingCount} 项待办`}
      style={[
        styles.banner,
        {
          backgroundColor: theme.colors.mint,
          borderColor: theme.colors.line,
          borderRadius: theme.radius.lg,
        },
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="label">
          {petName} 今日还有 {pendingCount} 项待办
        </AppText>
        <AppText variant="caption" muted>
          点一下去 Today 完成
        </AppText>
      </View>
      <CaretRight size={20} color={theme.colors.forest2} weight="bold" />
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
})
