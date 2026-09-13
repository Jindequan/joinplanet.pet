import React from 'react'
import { Image, Pressable, StyleSheet, View } from 'react-native'
import {
  ArrowCounterClockwise,
  Camera,
  CheckCircle,
  Heartbeat,
  NotePencil,
  Pill,
  Stethoscope,
  Syringe,
  Trash,
  WarningCircle,
  Scales,
} from 'phosphor-react-native'
import type { TimelineEvent } from '../../core/api/planet-api'
import { timelineActorLine } from '../../core/voice'
import { useTheme } from '../../core/providers/theme-provider'
import { AppText } from '../../ui/components/app-text'
import { describeEvent, isManualEvent, type EventDescription } from './registry'
import { formatClockInTimeZoneSafe } from './time'

function EventIcon({ icon }: { icon: EventDescription['icon'] }) {
  const { theme } = useTheme()
  const color = theme.colors.forest2
  const size = 19
  switch (icon) {
    case 'weight':
      return <Scales size={size} color={color} weight="duotone" />
    case 'syringe':
      return <Syringe size={size} color={color} weight="duotone" />
    case 'stethoscope':
      return <Stethoscope size={size} color={color} weight="duotone" />
    case 'pill':
      return <Pill size={size} color={color} weight="duotone" />
    case 'care':
      return <CheckCircle size={size} color={color} weight="duotone" />
    case 'undo':
      return <ArrowCounterClockwise size={size} color={color} weight="duotone" />
    case 'note':
      return <NotePencil size={size} color={color} weight="duotone" />
    case 'camera':
      return <Camera size={size} color={color} weight="duotone" />
    case 'symptom':
      return <WarningCircle size={size} color={color} weight="duotone" />
    default:
      return <Heartbeat size={size} color={color} weight="duotone" />
  }
}

export function EventCard({
  event,
  petName,
  familyName,
  weightDelta,
  timezone,
  onEdit,
  onDelete,
  onOpenOccurrence,
}: {
  event: TimelineEvent
  petName?: string
  familyName?: string
  weightDelta?: string | null
  timezone?: string
  onEdit?: () => void
  onDelete?: () => void
  onOpenOccurrence?: () => void
}) {
  const { theme } = useTheme()
  const description = describeEvent(event.type, event.payload)
  const manual = isManualEvent(event.source)
  const photoData = typeof event.payload?.photo_data === 'string' ? event.payload.photo_data : ''
  const timeText = formatClockInTimeZoneSafe(event.occurred_at, timezone)

  const mainContent = (
    <>
      <View
        style={[
          styles.icon,
          {
            backgroundColor: theme.colors.sageSoft,
            borderRadius: theme.radius.md,
          },
        ]}
      >
        <EventIcon icon={description.icon} />
      </View>
      <View style={styles.content}>
        <View style={styles.topline}>
          <AppText variant="heading" style={styles.title} numberOfLines={2}>
            {[description.category, petName].filter(Boolean).join(' · ')}
          </AppText>
          <AppText variant="caption" muted>
            {timeText}
          </AppText>
        </View>
        {description.icon === 'weight' && description.headline ? (
          <View style={styles.weightLine}>
            <AppText variant="label">{description.headline}</AppText>
            {weightDelta ? (
              <AppText variant="caption" color={theme.colors.mintStrong}>
                {weightDelta}
              </AppText>
            ) : null}
          </View>
        ) : (
          <>
            {description.headline ? (
              <AppText variant="body">{description.headline}</AppText>
            ) : null}
            {description.detail ? (
              <AppText variant="caption" muted>
                {description.detail}
              </AppText>
            ) : null}
          </>
        )}
        {photoData ? (
          <Image
            source={{ uri: photoData }}
            accessibilityLabel={`${petName ?? '宠物'}的照片`}
            style={styles.photo}
            resizeMode="cover"
          />
        ) : null}
        <AppText variant="caption" soft>
          {[timelineActorLine(event.recorded_by_name), familyName].filter(Boolean).join(' · ')}
        </AppText>
      </View>
    </>
  )

  // Keep the record navigation target separate from edit/delete controls.
  // Wrapping the whole card in Pressable creates nested interactive elements;
  // on Web, clicking edit or delete can otherwise also open the care task.
  const main = onOpenOccurrence ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`查看${petName ?? '宠物'}的${description.headline ?? description.category}照护`}
      onPress={onOpenOccurrence}
      style={({ pressed }) => [styles.main, { opacity: pressed ? 0.82 : 1 }]}
    >
      {mainContent}
    </Pressable>
  ) : (
    <View style={styles.main}>{mainContent}</View>
  )

  return (
    <View
      style={[
        styles.card,
        theme.shadow.card,
        {
          backgroundColor: theme.colors.paperStrong,
          borderColor: theme.colors.line,
          borderRadius: theme.radius.lg,
        },
      ]}
    >
      {main}
      {manual && onEdit && onDelete ? (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="编辑记录"
            onPress={onEdit}
            hitSlop={8}
            style={({ pressed }) => [
              styles.iconBtn,
              { opacity: pressed ? theme.motion.pressOpacity : 1 },
            ]}
          >
            <NotePencil size={16} color={theme.colors.forest2} weight="bold" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="删除记录"
            onPress={onDelete}
            hitSlop={8}
            style={({ pressed }) => [
              styles.iconBtn,
              { opacity: pressed ? theme.motion.pressOpacity : 1 },
            ]}
          >
            <Trash size={16} color={theme.colors.danger} weight="bold" />
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  main: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  icon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    gap: 4,
  },
  topline: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    flex: 1,
  },
  weightLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 4,
    paddingTop: 2,
  },
  photo: {
    width: '100%',
    height: 180,
    borderRadius: 14,
    marginTop: 4,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
