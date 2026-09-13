import React, { useState } from 'react'
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { CalendarBlank, Clock, X } from 'phosphor-react-native'
import { civilDateLabel } from '../../core/display'
import { useTheme } from '../../core/providers/theme-provider'
import { AppText } from './app-text'
import { Button } from './button'
import { ModalSheet } from './modal-sheet'

function toCivil(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 日期字段：显示当前值，点开原生日期选择器（iOS 用 sheet 内 spinner）。值为 YYYY-MM-DD。 */
export function DateField({
  label,
  value,
  onChange,
  placeholder = '未设置',
  maximumDate,
  minimumDate,
  clearable = true,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  placeholder?: string
  maximumDate?: Date
  minimumDate?: Date
  clearable?: boolean
}) {
  const { theme } = useTheme()
  const [open, setOpen] = useState(false)
  const current = value ? new Date(`${value}T12:00:00`) : new Date()
  const valid = value && !Number.isNaN(current.getTime())

  if (Platform.OS === 'web') {
    return (
      <View
        style={[
          styles.field,
          {
            borderColor: theme.colors.lineStrong,
            backgroundColor: theme.colors.paper,
            borderRadius: theme.radius.md,
          },
        ]}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="caption" muted>
            {label}
          </AppText>
          <TextInput
            accessibilityLabel={label}
            value={value}
            onChangeText={onChange}
            placeholder={placeholder}
            placeholderTextColor={theme.colors.soft}
            inputMode="numeric"
            maxLength={10}
            style={[styles.webInput, { color: theme.colors.ink }]}
          />
        </View>
        {valid && clearable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`清除${label}`}
            onPress={() => onChange('')}
            hitSlop={8}
            style={styles.clear}
          >
            <X size={15} color={theme.colors.soft} weight="bold" />
          </Pressable>
        ) : (
          <CalendarBlank size={18} color={theme.colors.forest2} />
        )}
      </View>
    )
  }

  return (
    <>
      <View
        style={[
          styles.field,
          {
            borderColor: theme.colors.lineStrong,
            backgroundColor: theme.colors.paper,
            borderRadius: theme.radius.md,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}：${valid ? value : placeholder}`}
          onPress={() => setOpen(true)}
          style={({ pressed }) => [styles.fieldMain, { opacity: pressed ? theme.motion.pressOpacity : 1 }]}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="caption" muted>
              {label}
            </AppText>
            <AppText variant="label" soft={!valid}>
              {valid ? civilDateLabel(value) : placeholder}
            </AppText>
          </View>
          {!(valid && clearable) ? <CalendarBlank size={18} color={theme.colors.forest2} /> : null}
        </Pressable>
        {valid && clearable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`清除${label}`}
            onPress={() => onChange('')}
            hitSlop={8}
            style={styles.clear}
          >
            <X size={15} color={theme.colors.soft} weight="bold" />
          </Pressable>
        ) : null}
      </View>

      {open && Platform.OS !== 'ios' ? (
        <DateTimePicker
          value={valid ? current : new Date()}
          mode="date"
          display="default"
          maximumDate={maximumDate}
          minimumDate={minimumDate}
          onChange={(event, next) => {
            setOpen(false)
            if (event.type === 'dismissed' || !next) return
            onChange(toCivil(next))
          }}
        />
      ) : null}

      {open && Platform.OS === 'ios' ? (
        <ModalSheet visible onClose={() => setOpen(false)}>
          <AppText variant="heading">{label}</AppText>
          <DateTimePicker
            value={valid ? current : new Date()}
            mode="date"
            display="spinner"
            maximumDate={maximumDate}
            minimumDate={minimumDate}
            onChange={(_, next) => {
              if (next) onChange(toCivil(next))
            }}
          />
          <Button label="完成" full onPress={() => setOpen(false)} />
        </ModalSheet>
      ) : null}
    </>
  )
}

function toHm(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

/** 时间字段：原生时间选择器，值为 HH:MM；可清除表示「不定点」。 */
export function TimeField({
  label,
  value,
  onChange,
  placeholder = '不定点',
  clearable = true,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  placeholder?: string
  clearable?: boolean
}) {
  const { theme } = useTheme()
  const [open, setOpen] = useState(false)
  const valid = /^\d{2}:\d{2}$/.test(value)
  const current = valid ? new Date(`2000-01-01T${value}:00`) : new Date(`2000-01-01T08:00:00`)

  if (Platform.OS === 'web') {
    return (
      <View
        style={[
          styles.field,
          {
            borderColor: theme.colors.lineStrong,
            backgroundColor: theme.colors.paper,
            borderRadius: theme.radius.md,
          },
        ]}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="caption" muted>
            {label}
          </AppText>
          <TextInput
            accessibilityLabel={label}
            value={value}
            onChangeText={onChange}
            placeholder={placeholder}
            placeholderTextColor={theme.colors.soft}
            inputMode="numeric"
            maxLength={5}
            style={[styles.webInput, { color: theme.colors.ink }]}
          />
        </View>
        {valid && clearable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`清除${label}`}
            onPress={() => onChange('')}
            hitSlop={8}
            style={styles.clear}
          >
            <X size={15} color={theme.colors.soft} weight="bold" />
          </Pressable>
        ) : (
          <Clock size={18} color={theme.colors.forest2} />
        )}
      </View>
    )
  }

  return (
    <>
      <View
        style={[
          styles.field,
          {
            borderColor: theme.colors.lineStrong,
            backgroundColor: theme.colors.paper,
            borderRadius: theme.radius.md,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}：${valid ? value : placeholder}`}
          onPress={() => setOpen(true)}
          style={({ pressed }) => [styles.fieldMain, { opacity: pressed ? theme.motion.pressOpacity : 1 }]}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="caption" muted>
              {label}
            </AppText>
            <AppText variant="label" soft={!valid}>
              {valid ? value : placeholder}
            </AppText>
          </View>
          {!(valid && clearable) ? <Clock size={18} color={theme.colors.forest2} /> : null}
        </Pressable>
        {valid && clearable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`清除${label}`}
            onPress={() => onChange('')}
            hitSlop={8}
            style={styles.clear}
          >
            <X size={15} color={theme.colors.soft} weight="bold" />
          </Pressable>
        ) : null}
      </View>

      {open && Platform.OS !== 'ios' ? (
        <DateTimePicker
          value={current}
          mode="time"
          display="default"
          onChange={(event, next) => {
            setOpen(false)
            if (event.type === 'dismissed' || !next) return
            onChange(toHm(next))
          }}
        />
      ) : null}

      {open && Platform.OS === 'ios' ? (
        <ModalSheet visible onClose={() => setOpen(false)}>
          <AppText variant="heading">{label}</AppText>
          <DateTimePicker
            value={current}
            mode="time"
            display="spinner"
            onChange={(_, next) => {
              if (next) onChange(toHm(next))
            }}
          />
          <Button label="完成" full onPress={() => setOpen(false)} />
        </ModalSheet>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  webInput: {
    minHeight: 28,
    padding: 0,
    borderWidth: 0,
    fontSize: 16,
    fontFamily: 'inherit',
  },
  field: {
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  fieldMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  clear: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
