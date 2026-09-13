import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { Bell, CaretRight, DotsThree, PawPrint, Planet, Sun, ClockCounterClockwise, UserCircle } from 'phosphor-react-native'
import { router, usePathname } from 'expo-router'
import { planetApi } from '../../core/api/planet-api'
import { queryKeys } from '../../core/query/keys'
import { useSession } from '../../core/providers/session-provider'
import { useScope } from '../../core/providers/scope-provider'
import { useTheme } from '../../core/providers/theme-provider'
import { AppText } from '../components/app-text'
import { PressableScale } from '../motion'

const ITEMS = [
  { key: 'today', label: '今天', hint: '现在要做什么', href: '/', icon: Sun },
  { key: 'requests', label: '请求', hint: '需要你回应的照护', href: '/requests', icon: Bell },
  { key: 'pets', label: '宠物', hint: '档案与照护计划', href: '/pets', icon: PawPrint },
  { key: 'timeline', label: '记录', hint: '宠物发生过什么', href: '/timeline', icon: ClockCounterClockwise },
  { key: 'more', label: '更多', hint: '家庭与账户管理', href: '/more', icon: DotsThree },
] as const

function activeKey(pathname: string) {
  if (pathname === '/' || pathname === '/index' || pathname.includes('/today')) return 'today'
  if (pathname.includes('/requests') || pathname.includes('/handoffs')) return 'requests'
  if (pathname.includes('timeline')) return 'timeline'
  if (pathname.includes('/pets')) return 'pets'
  return 'more'
}

export function WebWorkspaceRail() {
  const { theme } = useTheme()
  const { status, userId } = useSession()
  const { setScope } = useScope()
  const pathname = usePathname()
  const active = activeKey(pathname)
  const requestInbox = useQuery({
    queryKey: queryKeys.careRequestInbox,
    queryFn: () => planetApi.careRequests.inbox(),
    enabled: status === 'authenticated' && Boolean(userId),
  })
  const batchInbox = useQuery({
    queryKey: queryKeys.careHandoffInbox,
    queryFn: () => planetApi.careHandoffBatches.inbox(),
    enabled: status === 'authenticated' && Boolean(userId),
  })
  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => planetApi.me.get(),
    enabled: status === 'authenticated' && Boolean(userId),
  })
  const pendingRequestIds = new Set<string>()
  for (const request of requestInbox.data?.care_requests ?? []) {
    if (request.state === 'sent' || request.state === 'seen') pendingRequestIds.add(request.id)
  }
  for (const batch of batchInbox.data?.batches ?? []) {
    for (const request of batch.requests) {
      if (request.state === 'sent' || request.state === 'seen') pendingRequestIds.add(request.id)
    }
  }
  const pendingRequestCount = pendingRequestIds.size
  const openRequestCenter = () => {
    // The primary request inbox is cross-family. A stale Pet scope would hide
    // a request from another household after the user enters from the rail.
    setScope({ type: 'all' })
    router.replace('/requests' as never)
  }

  return (
    <View style={[styles.rail, { borderRightColor: theme.colors.line }]}>
      <View style={styles.brand}>
        <View style={[styles.brandMark, { borderColor: theme.colors.forest2 }]}>
          <Planet size={18} color={theme.colors.forest2} weight="duotone" />
        </View>
        <View style={{ gap: 2 }}>
          <AppText variant="label" color={theme.colors.forest2}>PLANET</AppText>
          <AppText variant="caption" muted>家庭宠物照护</AppText>
        </View>
      </View>

      <View style={styles.nav}>
        <AppText variant="eyebrow" soft style={styles.navLabel}>工作区</AppText>
        {ITEMS.map((item) => {
          const Icon = item.icon
          const selected = active === item.key
          return (
            <PressableScale
              key={item.key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${item.label}：${item.hint}${item.key === 'requests' && pendingRequestCount > 0 ? `，${pendingRequestCount} 条待回应` : ''}`}
              onPress={() => item.key === 'requests' ? openRequestCenter() : router.replace(item.href as never)}
              style={[
                styles.navItem,
                {
                  backgroundColor: selected ? theme.colors.forest2 : 'transparent',
                  borderColor: selected ? theme.colors.forest2 : 'transparent',
                },
              ]}
            >
              <View style={[styles.iconBox, { backgroundColor: selected ? theme.colors.onBrandSoft : theme.colors.sageSoft }]}> 
                <Icon size={19} color={selected ? theme.colors.onBrand : theme.colors.forest2} weight={selected ? 'fill' : 'regular'} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="label" color={selected ? theme.colors.onBrand : undefined}>{item.label}</AppText>
                <AppText variant="caption" color={selected ? theme.colors.onBrandMuted : undefined} muted={!selected} numberOfLines={1}>{item.hint}</AppText>
              </View>
              {item.key === 'requests' && pendingRequestCount > 0 ? (
                <View style={[styles.navBadge, { backgroundColor: theme.colors.coralDark }]}>
                  <AppText variant="caption" color={theme.colors.onBrand} style={styles.navBadgeLabel}>
                    {pendingRequestCount > 99 ? '99+' : pendingRequestCount}
                  </AppText>
                </View>
              ) : null}
            </PressableScale>
          )
        })}
      </View>

      <View style={styles.footer}>
        {pendingRequestCount > 0 ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`${pendingRequestCount} 条待回应的照护请求`}
            onPress={openRequestCenter}
            style={[styles.railNote, { backgroundColor: theme.colors.forest2 }]}
          >
            <AppText variant="eyebrow" color={theme.colors.onBrandMuted}>待回应</AppText>
            <AppText variant="label" color={theme.colors.onBrand}>{pendingRequestCount} 条请求</AppText>
            <AppText variant="caption" color={theme.colors.onBrandMuted}>打开请求，处理今天的分工</AppText>
          </PressableScale>
        ) : (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="没有待回应的照护请求"
            onPress={openRequestCenter}
            style={[styles.railQuiet, { backgroundColor: theme.colors.sageSoft, borderColor: theme.colors.line }]}
          >
            <Bell size={17} color={theme.colors.forest2} weight="regular" />
            <View style={{ flex: 1, gap: 1 }}>
              <AppText variant="caption" color={theme.colors.forest2} style={{ fontWeight: '800' }}>请求</AppText>
              <AppText variant="caption" muted>目前没有待回应</AppText>
            </View>
            <CaretRight size={14} color={theme.colors.soft} weight="bold" />
          </PressableScale>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="打开家庭管理"
          onPress={() => router.push('/families' as never)}
          style={styles.familyLink}
        >
          <AppText variant="caption" color={theme.colors.forest2}>家庭管理</AppText>
          <AppText variant="caption" muted>成员、邀请和权限</AppText>
        </Pressable>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="打开账户与安全"
          onPress={() => router.push('/account' as never)}
          style={styles.account}
        >
          <View style={[styles.accountAvatar, { backgroundColor: theme.colors.coralSoft }]}>
            {me.data?.user ? (
              <AppText variant="label" color={theme.colors.coralDark}>
                {me.data.user.display_name.slice(0, 1).toUpperCase()}
              </AppText>
            ) : (
              <UserCircle size={19} color={theme.colors.coralDark} weight="duotone" />
            )}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="label" numberOfLines={1}>
              {me.data?.user.display_name ?? '账户'}
            </AppText>
            <AppText variant="caption" muted numberOfLines={1}>账户与设置</AppText>
          </View>
          <CaretRight size={16} color={theme.colors.soft} weight="bold" />
        </PressableScale>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  rail: {
    width: 220,
    minHeight: '100%',
    paddingHorizontal: 16,
    paddingTop: 32,
    paddingBottom: 22,
    borderRightWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(233,232,225,0.92)',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  brandMark: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nav: { gap: 4, marginTop: 42 },
  navLabel: { marginLeft: 10, marginBottom: 3 },
  navItem: {
    minHeight: 54,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  navBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  navBadgeLabel: { fontSize: 10, lineHeight: 12, fontWeight: '900' },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { marginTop: 'auto', gap: 8 },
  railNote: {
    gap: 8,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 18,
    marginBottom: 4,
  },
  railQuiet: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  familyLink: { gap: 2, paddingHorizontal: 4, paddingVertical: 8 },
  account: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 4,
    paddingVertical: 7,
    borderRadius: 13,
  },
  accountAvatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
