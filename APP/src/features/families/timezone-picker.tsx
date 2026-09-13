import React, { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Check } from 'phosphor-react-native'
import { timezoneCity, timezoneLabel, timezoneOptions } from '../../core/display'
import { useTheme } from '../../core/providers/theme-provider'
import { AppText } from '../../ui/components/app-text'
import { ModalSheet } from '../../ui/components/modal-sheet'
import { TextField } from '../../ui/components/text-field'
import { hapticSelection } from '../../ui/motion'

/** 时区行内选择器：显示当前值，点开可搜索的完整列表。 */
export function TimezoneField({
  value,
  onChange,
  hint,
}: {
  value: string
  onChange: (tz: string) => void
  hint?: string
}) {
  const { theme } = useTheme()
  const [open, setOpen] = useState(false)
  const device = Intl.DateTimeFormat().resolvedOptions().timeZone

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`家庭时区：${timezoneLabel(value)}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.field,
          {
            borderColor: theme.colors.lineStrong,
            backgroundColor: theme.colors.paper,
            borderRadius: theme.radius.md,
            opacity: pressed ? theme.motion.pressOpacity : 1,
          },
        ]}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="caption" muted>
            家庭时区
          </AppText>
          <AppText variant="label">
            {timezoneLabel(value)}
            {value === device ? ' · 本机' : ''}
          </AppText>
        </View>
        <AppText variant="caption" color={theme.colors.forest2}>
          更改
        </AppText>
      </Pressable>
      {hint ? (
        <AppText variant="caption" soft>
          {hint}
        </AppText>
      ) : null}

      <TimezonePickerSheet
        visible={open}
        current={value}
        onClose={() => setOpen(false)}
        onSelect={(tz) => {
          onChange(tz)
          setOpen(false)
        }}
      />
    </>
  )
}

export function TimezonePickerSheet({
  visible,
  current,
  onClose,
  onSelect,
}: {
  visible: boolean
  current: string
  onClose: () => void
  onSelect: (tz: string) => void
}) {
  const { theme } = useTheme()
  const [search, setSearch] = useState('')
  const device = Intl.DateTimeFormat().resolvedOptions().timeZone

  const options = useMemo(() => {
    const all = timezoneOptions(current)
    const keyword = search.trim().toLowerCase()
    if (!keyword) return all
    return all.filter(
      (tz) =>
        tz.toLowerCase().includes(keyword) ||
        timezoneCity(tz).toLowerCase().includes(keyword),
    )
  }, [current, search])

  return (
    <ModalSheet visible={visible} onClose={onClose}>
      <AppText variant="heading">选择时区</AppText>
      <AppText variant="caption" muted style={{ marginBottom: 8 }}>
        时区决定这个家庭的「今天」从几点开始。
      </AppText>
      <TextField
        label="搜索城市"
        value={search}
        onChangeText={setSearch}
        maxLength={80}
        placeholder="如 Shanghai / Tokyo"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <ScrollView style={styles.list} showsVerticalScrollIndicator>
        {options.length === 0 ? (
          <AppText muted style={{ paddingVertical: 12 }}>
            没有匹配的时区，试试英文城市名。
          </AppText>
        ) : (
          options.map((tz) => {
            const selected = tz === current
            return (
              <Pressable
                key={tz}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  void hapticSelection()
                  onSelect(tz)
                }}
                style={({ pressed }) => [
                  styles.option,
                  {
                    backgroundColor:
                      selected || pressed ? theme.colors.sageSoft : 'transparent',
                    borderRadius: theme.radius.md,
                  },
                ]}
              >
                <View style={{ flex: 1, gap: 1 }}>
                  <AppText variant="label">
                    {timezoneCity(tz)}
                    {tz === device ? ' · 本机' : ''}
                  </AppText>
                  <AppText variant="caption" muted>
                    {timezoneLabel(tz)}
                  </AppText>
                </View>
                {selected ? (
                  <Check size={16} color={theme.colors.forest2} weight="bold" />
                ) : null}
              </Pressable>
            )
          })
        )}
      </ScrollView>
    </ModalSheet>
  )
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 56,
  },
  list: {
    maxHeight: 320,
    marginTop: 4,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
})
