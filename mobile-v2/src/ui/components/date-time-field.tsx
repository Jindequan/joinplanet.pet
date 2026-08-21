import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import dayjs from 'dayjs';
import { CalendarDotsIcon } from '../icons';
import { useTheme } from '../../core/providers/theme-provider';

type PickerMode = 'date' | 'time';
export function DateTimeField({ label, value, onChange, mode = 'date', placeholder = 'Choose a date', minimumDate, maximumDate }: { label: string; value: Date | null; onChange: (value: Date) => void; mode?: PickerMode; placeholder?: string; minimumDate?: Date; maximumDate?: Date }) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const handleChange = (event: DateTimePickerEvent, nextDate?: Date) => { setOpen(Platform.OS === 'ios'); if (event.type === 'set' && nextDate) onChange(nextDate); };
  const display = value ? dayjs(value).format(mode === 'date' ? 'MMM D, YYYY' : 'h:mm A') : placeholder;
  return <View style={[styles.wrap, { gap: theme.spacing.xs }]}><Text style={[theme.typography.label, { color: theme.colors.text }]}>{label}</Text><Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => setOpen(true)} style={[styles.field, { minHeight: 48, borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.sm, backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><CalendarDotsIcon size={20} color={theme.colors.brandStrong} weight="regular" /><Text style={[theme.typography.body, { color: value ? theme.colors.text : theme.colors.textSubtle }]}>{display}</Text></Pressable>{open ? <DateTimePicker value={value ?? new Date()} mode={mode} display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={handleChange} minimumDate={minimumDate} maximumDate={maximumDate} /> : null}</View>;
}
const styles = StyleSheet.create({ wrap: {}, field: { borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10 } });
