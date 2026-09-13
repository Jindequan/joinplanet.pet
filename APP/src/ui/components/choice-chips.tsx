import React from 'react'
import { StyleSheet, View } from 'react-native'
import { useTheme } from '../../core/providers/theme-provider'
import { hapticSelection, PressableScale } from '../motion'
import { AppText } from './app-text'

export type ChipOption<T extends string> = { value: T; label: string }

/** 单选 chip 组：统一触觉反馈、按压态与无障碍语义。 */
export function ChoiceChips<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label?: string
  options: Array<ChipOption<T>>
  value: T
  onChange: (next: T) => void
  disabled?: boolean
}) {
  const { theme } = useTheme()
  return (
    <View style={{ gap: theme.spacing.xs }}>
      {label ? (
        <AppText variant="caption" muted style={{ fontWeight: '800' }}>
          {label}
        </AppText>
      ) : null}
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((option) => {
          const selected = option.value === value
          return (
            <PressableScale
              key={option.value || option.label}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: Boolean(disabled) }}
              accessibilityLabel={`${label ? `${label}：` : ''}${option.label}`}
              disabled={Boolean(disabled) && !selected}
              pressedScale={0.97}
              onPress={() => {
                if (selected || disabled) return
                void hapticSelection()
                onChange(option.value)
              }}
              style={[
                styles.chip,
                {
                  minHeight: theme.layout.touchTarget,
                  backgroundColor: selected ? theme.colors.forest2 : theme.colors.sageSoft,
                  borderRadius: theme.radius.md,
                },
              ]}
            >
              <AppText
                variant="caption"
                color={selected ? theme.colors.onBrand : theme.colors.forest2}
              >
                {option.label}
              </AppText>
            </PressableScale>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
})
