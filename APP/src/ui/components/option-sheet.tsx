import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useTheme } from '../../core/providers/theme-provider'
import { AppText } from './app-text'
import { ModalSheet } from './modal-sheet'

export function SelectField({
  label,
  value,
  onPress,
}: {
  label: string
  value: string
  onPress: () => void
}) {
  const { theme } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}：${value}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.select,
        {
          borderColor: theme.colors.line,
          backgroundColor: theme.colors.paper,
          borderRadius: theme.radius.md,
          opacity: pressed ? theme.motion.pressOpacity : 1,
        },
      ]}
    >
      <AppText variant="caption" muted>
        {label}
      </AppText>
      <AppText variant="label" numberOfLines={1}>
        {value}
      </AppText>
    </Pressable>
  )
}

export function OptionSheet({
  visible,
  title,
  options,
  selected,
  onClose,
  onSelect,
}: {
  visible: boolean
  title: string
  options: Array<{ value: string; label: string }>
  selected: string
  onClose: () => void
  onSelect: (value: string) => void
}) {
  const { theme } = useTheme()
  return (
    <ModalSheet visible={visible} onClose={onClose}>
      <AppText variant="heading" style={{ marginBottom: 12 }}>
        {title}
      </AppText>
      <View style={{ gap: 4 }}>
        {options.map((option) => {
          const active = option.value === selected
          return (
            <Pressable
              key={option.value || '__empty'}
              accessibilityRole="button"
              accessibilityLabel={`${title}：${option.label}`}
              accessibilityState={{ selected: active }}
              onPress={() => onSelect(option.value)}
              style={({ pressed }) => [
                styles.optionRow,
                {
                  backgroundColor: active || pressed ? theme.colors.sageSoft : 'transparent',
                  borderRadius: theme.radius.md,
                },
              ]}
            >
              <AppText variant="label" color={active ? theme.colors.forest2 : theme.colors.ink}>
                {option.label}
              </AppText>
            </Pressable>
          )
        })}
      </View>
    </ModalSheet>
  )
}

const styles = StyleSheet.create({
  select: {
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  optionRow: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
})
