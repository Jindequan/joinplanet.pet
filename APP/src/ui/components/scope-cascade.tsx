import React, { useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import { CaretDown, Check, SquaresFour, X } from 'phosphor-react-native'
import { planetApi } from '../../core/api/planet-api'
import { useTheme } from '../../core/providers/theme-provider'
import { queryKeys } from '../../core/query/keys'
import { useScope, type Scope } from '../../core/scope/scope-provider'
import { scopeFilterNeeded } from '../../core/scope/scope'
import { AppText } from './app-text'
import { hapticSelection } from '../motion'
import { GlassBar } from './glass-bar'
import { PetAvatar } from './pet-avatar'

type Props = {
  style?: StyleProp<ViewStyle>
  variant?: 'header' | 'page'
  /** Keep the scope switcher available even when there is only one family/pet. */
  alwaysVisible?: boolean
  /** Read-only pages such as Timeline may include archived Pet history. */
  includeArchived?: boolean
}

const MENU_RADIUS = 13
const OPTION_RADIUS = 11

/**
 * 三栏不是固定弹窗：桌面要给家庭名和宠物名足够的呼吸空间，手机则
 * 必须保证总宽度不溢出。第一栏也不能再把“全部宠物”拆成一条窄竖列。
 */
const COL_ALL_DESKTOP = 108
const COL_FAMILY_MIN = 84
const COL_FAMILY_DESKTOP = 160
const COL_PET_MIN = 132
const COL_PET_DESKTOP = 280

const MENU_MIN_HEIGHT = 200
const MENU_MAX_HEIGHT_RATIO = 0.52
const MENU_MAX_HEIGHT_CAP = 420

const optionShellStyle = Platform.select({
  ios: { borderCurve: 'continuous' as const },
  default: {},
})

function layoutColumns(screenWidth: number) {
  const outerMax = Math.max(0, screenWidth - 32)
  const desiredWidth = COL_ALL_DESKTOP + COL_FAMILY_DESKTOP + COL_PET_DESKTOP
  const menuWidth = Math.min(outerMax, desiredWidth)

  // At the normal desktop width this is a deliberate 108 / 160 / 280 split.
  // Under that breakpoint, preserve the pet column and take space from the
  // first two columns before allowing the menu to become narrower than the
  // viewport.
  let allWidth = menuWidth >= 440
    ? COL_ALL_DESKTOP
    : Math.max(72, Math.round(menuWidth * 0.21))
  let familyWidth = menuWidth >= 440
    ? COL_FAMILY_DESKTOP
    : Math.max(COL_FAMILY_MIN, Math.round(menuWidth * 0.29))
  let petWidth = menuWidth - allWidth - familyWidth

  if (petWidth < COL_PET_MIN) {
    const familyRoom = Math.max(COL_FAMILY_MIN, menuWidth - allWidth - COL_PET_MIN)
    familyWidth = Math.min(familyWidth, familyRoom)
    petWidth = menuWidth - allWidth - familyWidth
  }
  if (petWidth < COL_PET_MIN) {
    allWidth = Math.max(72, menuWidth - familyWidth - COL_PET_MIN)
    petWidth = menuWidth - allWidth - familyWidth
  }

  return { menuWidth, allWidth, familyWidth, petWidth }
}

export function ScopeCascade({
  style,
  variant = 'header',
  alwaysVisible = false,
  includeArchived = false,
}: Props) {
  const { theme } = useTheme()
  const { width, height } = useWindowDimensions()
  const { scope, setScope, ready: scopeReady } = useScope()
  const [open, setOpen] = useState(false)
  const [focusFamilyId, setFocusFamilyId] = useState<string | null>(null)

  // Modal 挂在窗口层：宿主屏幕留栈跳走（深链/推送）时菜单会盖住新页面，失焦即收起。
  const focused = useIsFocused()
  React.useEffect(() => {
    if (!focused && open) setOpen(false)
  }, [focused, open])

  const familiesQuery = useQuery({
    queryKey: queryKeys.families,
    queryFn: () => planetApi.families.list(),
  })
  const petsQuery = useQuery({
    queryKey: queryKeys.accessiblePets,
    queryFn: async () => {
      const res = await planetApi.pets.listAccessible()
      return {
        pets: (res.pets ?? []).map((pet) => ({
          ...pet,
          family_ids: pet.family_ids ?? [],
        })),
      }
    },
  })
  const preferencesQuery = useQuery({
    queryKey: queryKeys.preferences,
    queryFn: () => planetApi.me.preferences(),
  })

  const families = familiesQuery.data?.families ?? []
  const pets = (petsQuery.data?.pets ?? []).filter((pet) => includeArchived || !pet.archived_at)
  const loading = !scopeReady || familiesQuery.isLoading || petsQuery.isLoading
  // Preferences only choose the initial family. They must not take the
  // All/Family/Pet switcher offline when the preference endpoint is slow or
  // unavailable; the authoritative family and pet lists are enough to use it.
  const loadError = familiesQuery.error ?? petsQuery.error
  const filterNeeded = scopeFilterNeeded(families, pets)

  const focusPets = focusFamilyId
    ? pets.filter((pet) => pet.family_ids.includes(focusFamilyId))
    : pets

  const familyRecord =
    scope.type === 'family'
      ? families.find((family) => family.id === scope.id)
      : undefined
  const petRecord =
    scope.type === 'pet' ? pets.find((pet) => pet.id === scope.id) : undefined
  const petFamilyRecord =
    scope.type === 'pet' && scope.familyId
      ? families.find((family) => family.id === scope.familyId)
      : undefined

  const scopeTitle = scope.type === 'all'
    ? '全部宠物'
    : scope.type === 'family'
      ? familyRecord?.name ?? '家庭'
      : petRecord?.name ?? '宠物'
  const scopeDetail = scope.type === 'all'
    ? '所有家庭'
    : scope.type === 'family'
      ? '家庭'
      : petFamilyRecord?.name
  const scopeKind = scope.type === 'all' ? '全部' : scope.type === 'family' ? '家庭' : '宠物'
  const scopeSummary = scope.type === 'all'
    ? `${scopeKind} · ${scopeDetail}`
    : `${scopeKind} · ${scopeTitle}${scopeDetail && scope.type === 'pet' ? ` · ${scopeDetail}` : ''}`

  function initialFamilyId() {
    if (scope.type === 'family') return scope.id
    if (scope.type === 'pet') {
      const familyIds = pets.find((pet) => pet.id === scope.id)?.family_ids ?? []
      if (scope.familyId && familyIds.includes(scope.familyId)) return scope.familyId
      const preferred = preferencesQuery.data?.preferences.default_family_id
      if (preferred && familyIds.includes(preferred)) return preferred
      return familyIds[0] ?? families[0]?.id ?? null
    }
    const preferred = preferencesQuery.data?.preferences.default_family_id
    return preferred && families.some((family) => family.id === preferred)
      ? preferred
      : families[0]?.id ?? null
  }

  function openPicker() {
    // “全部” is a real scope, not an implicit first-family selection. Keep
    // the pet column global until the user explicitly chooses a family.
    setFocusFamilyId(scope.type === 'all' ? null : initialFamilyId())
    setOpen(true)
  }

  function pick(next: Scope) {
    void hapticSelection()
    setScope(next)
    setOpen(false)
  }

  if (loading) {
    return (
      <View
        style={[styles.loading, style]}
        accessibilityRole="progressbar"
        accessibilityLabel="正在加载家庭和宠物范围"
      >
        <ActivityIndicator color={theme.colors.forest2} />
      </View>
    )
  }

  if (loadError) {
    return (
      <View
        style={[
          styles.error,
          {
            backgroundColor: theme.colors.coralSoft,
            borderColor: theme.colors.dangerLine,
          },
          style,
        ]}
      >
        <AppText variant={variant === 'page' ? 'caption' : 'caption'} color={theme.colors.coralDark}>
          范围暂时无法更新
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="重试更新范围"
          onPress={() => {
            void Promise.all([
              familiesQuery.refetch(),
              petsQuery.refetch(),
              preferencesQuery.refetch(),
            ])
          }}
          hitSlop={8}
          style={styles.errorRetry}
        >
          <AppText variant="caption" color={theme.colors.coralDark}>重试</AppText>
        </Pressable>
      </View>
    )
  }

  if (!alwaysVisible && !filterNeeded) return null

  const isPage = variant === 'page'
  const triggerRadius = isPage ? MENU_RADIUS : 999
  const { menuWidth, allWidth, familyWidth, petWidth } = layoutColumns(width)
  const menuMaxHeight = Math.min(Math.round(height * MENU_MAX_HEIGHT_RATIO), MENU_MAX_HEIGHT_CAP)
  const rowCount = Math.max(1, families.length, focusPets.length)
  const menuBodyHeight = Math.min(
    menuMaxHeight,
    Math.max(MENU_MIN_HEIGHT, rowCount * 56 + 16),
  )

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`当前范围：${scopeTitle}${scopeDetail ? `，${scopeDetail}` : ''}`}
        accessibilityHint="打开范围选择"
        accessibilityState={{ expanded: open }}
        onPress={openPicker}
        style={({ pressed }) => [
          styles.triggerWrap,
          { opacity: pressed ? theme.motion.pressOpacity : 1 },
          style,
        ]}
      >
        <GlassBar
          radius={triggerRadius}
          style={[styles.trigger, { minHeight: isPage ? (scopeDetail ? 58 : 46) : 40, borderRadius: triggerRadius }]}
        >
        {scope.type === 'all' ? (
          <>
            <SquaresFour size={isPage ? 18 : 16} color={theme.colors.forest2} weight="bold" />
            <View style={styles.triggerCopy}>
              <AppText variant={isPage ? 'label' : 'caption'} style={styles.triggerLabel}>
                {scopeTitle}
              </AppText>
              {isPage ? <AppText variant="caption" muted numberOfLines={1}>{scopeKind} · {scopeDetail}</AppText> : null}
            </View>
            <CaretDown size={14} color={theme.colors.soft} weight="bold" />
          </>
        ) : scope.type === 'family' ? (
          <>
            <View style={styles.triggerCopy}>
              <AppText variant={isPage ? 'label' : 'caption'} style={styles.triggerLabel} numberOfLines={1}>
                {scopeTitle}
              </AppText>
              {isPage ? <AppText variant="caption" muted>家庭范围</AppText> : null}
            </View>
            <CaretDown size={14} color={theme.colors.soft} weight="bold" />
          </>
        ) : (
          <>
            {petRecord ? (
              <PetAvatar
                petId={petRecord.id}
                species={petRecord.species}
                size={isPage ? 28 : 24}
                decorative
              />
            ) : null}
            <View style={styles.triggerCopy}>
              <AppText variant={isPage ? 'label' : 'caption'} style={styles.triggerLabel} numberOfLines={1}>
                {scopeTitle}
              </AppText>
              {isPage && scopeDetail ? <AppText variant="caption" muted numberOfLines={1}>{scopeKind} · {scopeDetail}</AppText> : null}
            </View>
            <CaretDown size={14} color={theme.colors.soft} weight="bold" />
          </>
        )}
        </GlassBar>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable
            style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(28, 37, 31, 0.28)' }]}
            onPress={() => setOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="点击空白处关闭范围选择"
          />
          <GlassBar
            radius={MENU_RADIUS}
            style={[styles.menu, { width: menuWidth, maxHeight: menuMaxHeight }]}
          >
            <View style={styles.menuHeader}>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="label">选择范围</AppText>
                <AppText variant="caption" muted>先选家庭，再选宠物；也可以看全部</AppText>
              </View>
              <AppText variant="caption" color={theme.colors.forest2}>{scopeSummary}</AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="关闭范围选择"
                onPress={() => setOpen(false)}
                hitSlop={8}
                style={styles.closeButton}
              >
                <X size={18} color={theme.colors.forest2} weight="bold" />
              </Pressable>
            </View>
            <View style={[styles.columns, { height: menuBodyHeight }]}>
              <ScrollView
                style={[styles.col, { width: allWidth }]}
                contentContainerStyle={styles.colBody}
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                <Row
                  mode="icon"
                  label="全部宠物"
                  icon={<SquaresFour size={18} color={theme.colors.forest2} weight="bold" />}
                  selected={scope.type === 'all'}
                  focused={scope.type === 'all'}
                  onPress={() => pick({ type: 'all' })}
                />
              </ScrollView>

              <ScrollView
                style={[styles.col, { width: familyWidth }]}
                contentContainerStyle={styles.colBody}
                showsVerticalScrollIndicator
                nestedScrollEnabled
              >
                {families.map((family) => {
                  const familyPicked = scope.type === 'family' && scope.id === family.id
                  const petPickedInFamily =
                    scope.type === 'pet' &&
                    (scope.familyId
                      ? scope.familyId === family.id
                      : pets.some(
                          (pet) => pet.id === scope.id && pet.family_ids.includes(family.id),
                        ))
                  return (
                    <Row
                      key={family.id}
                      mode="label"
                      label={family.name}
                      selected={familyPicked || petPickedInFamily}
                      focused={focusFamilyId === family.id}
                      onPress={() => {
                        void hapticSelection()
                        // A family is a complete scope on its own. Select it
                        // on the first tap, keep the picker open, and let the
                        // next tap optionally narrow the same family to one
                        // pet. The old two-tap-to-select behavior was hidden
                        // state and made the All → Family → Pet path unclear.
                        setFocusFamilyId(family.id)
                        setScope({ type: 'family', id: family.id })
                      }}
                    />
                  )
                })}
              </ScrollView>

              <ScrollView
                style={[styles.col, styles.colLast, { width: petWidth }]}
                contentContainerStyle={styles.colBody}
                showsVerticalScrollIndicator
                nestedScrollEnabled
              >
                {focusPets.map((pet) => (
                  <Row
                    key={pet.id}
                    mode="pet"
                    label={`${pet.name}${pet.archived_at ? ' · 已归档' : ''}`}
                    petId={pet.id}
                    species={pet.species}
                    selected={scope.type === 'pet' && scope.id === pet.id}
                    focused={scope.type === 'pet' && scope.id === pet.id}
                    onPress={() => pick({ type: 'pet', id: pet.id, familyId: focusFamilyId ?? undefined })}
                  />
                ))}
              </ScrollView>
            </View>
          </GlassBar>
        </View>
      </Modal>
    </>
  )
}

function Row({
  mode,
  label,
  icon,
  petId,
  species,
  selected,
  focused,
  onPress,
}: {
  mode: 'icon' | 'label' | 'pet'
  label?: string
  icon?: React.ReactNode
  petId?: string
  species?: string
  selected: boolean
  focused: boolean
  onPress: () => void
}) {
  const { theme } = useTheme()
  const lit = selected || focused
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label ?? (mode === 'icon' ? '全部' : undefined)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        mode === 'icon' && styles.rowIconOnly,
        mode === 'label' && styles.rowLabelOnly,
        mode === 'pet' && styles.rowPet,
        optionShellStyle,
        {
          backgroundColor: lit ? 'rgba(228, 235, 224, 0.82)' : 'transparent',
          opacity: pressed ? theme.motion.pressOpacity : 1,
        },
      ]}
    >
      {mode === 'icon' ? icon : null}
      {mode === 'icon' && label ? (
        <AppText variant="caption" style={styles.wrapText}>
          {label}
        </AppText>
      ) : null}
      {mode === 'label' && label ? (
        <AppText variant="caption" style={styles.wrapText}>
          {label}
        </AppText>
      ) : null}
      {mode === 'pet' && petId ? (
        <>
          <PetAvatar petId={petId} species={species} size={34} decorative />
          <AppText variant="label" style={styles.wrapText}>
            {label}
          </AppText>
        </>
      ) : null}
      {selected ? (
        <Check size={14} color={theme.colors.forest2} weight="bold" style={styles.check} />
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  loading: { minHeight: 44, justifyContent: 'center' },
  error: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: MENU_RADIUS,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  triggerWrap: {
    alignSelf: 'flex-start',
    maxWidth: 240,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  errorRetry: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  triggerCopy: {
    flexShrink: 1,
    gap: 1,
    minWidth: 0,
  },
  triggerLabel: {
    flexShrink: 1,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  menu: {
    zIndex: 2,
  },
  menuHeader: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  columns: {
    flexDirection: 'row',
    minHeight: MENU_MIN_HEIGHT,
  },
  col: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(32, 48, 40, 0.1)',
  },
  colLast: {
    borderRightWidth: 0,
  },
  colBody: {
    paddingVertical: 6,
    paddingHorizontal: 5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 10,
    minHeight: 44,
    marginBottom: 4,
    borderRadius: OPTION_RADIUS,
  },
  rowIconOnly: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    minHeight: 44,
  },
  rowLabelOnly: {
    paddingHorizontal: 8,
  },
  rowPet: {
    paddingHorizontal: 10,
    gap: 10,
    minHeight: 50,
  },
  wrapText: {
    flex: 1,
    flexShrink: 1,
  },
  check: {
    marginTop: 2,
  },
})
