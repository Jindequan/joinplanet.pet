import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import type { Pet } from '../../core/api/planet-api'
import { useTheme } from '../../core/providers/theme-provider'
import { AppText } from '../../ui/components/app-text'
import { PetAvatar } from '../../ui/components/pet-avatar'
import { hapticSelection } from '../../ui/motion'

const OPTIONS: Array<{ value: Pet['species']; label: string }> = [
  { value: 'dog', label: '狗' },
  { value: 'cat', label: '猫' },
  { value: 'other', label: '其他' },
]

/** 物种选择：用品牌插画头像做大目标卡片，识别优于回忆。 */
export function SpeciesPicker({
  value,
  onChange,
}: {
  value: Pet['species']
  onChange: (next: Pet['species']) => void
}) {
  const { theme } = useTheme()
  return (
    <View style={{ gap: 8 }}>
      <AppText variant="caption" muted style={{ fontWeight: '800' }}>
        物种
      </AppText>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="物种">
        {OPTIONS.map((option) => {
          const selected = option.value === value
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`物种：${option.label}`}
              onPress={() => {
                if (selected) return
                void hapticSelection()
                onChange(option.value)
              }}
              style={({ pressed }) => [
                styles.card,
                {
                  borderColor: selected ? theme.colors.forest2 : theme.colors.line,
                  backgroundColor: selected ? theme.colors.sageSoft : theme.colors.paper,
                  borderRadius: theme.radius.lg,
                  opacity: pressed ? theme.motion.pressOpacity : 1,
                },
              ]}
            >
              <PetAvatar petId={`species-${option.value}`} species={option.value} size={52} decorative />
              <AppText variant="label" color={selected ? theme.colors.forest2 : undefined}>
                {option.label}
              </AppText>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  card: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    borderWidth: 1.5,
  },
})
