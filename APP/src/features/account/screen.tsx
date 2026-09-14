import React, { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { DeviceMobile, ShieldCheck, SignOut, Trash } from 'phosphor-react-native'
import { Redirect, router } from 'expo-router'
import { OptionSheet, SelectField } from '../../ui/components/option-sheet'
import { planetApi } from '../../core/api/planet-api'
import { errorMessage } from '../../core/api/errors'
import { useCapabilities } from '../../core/capabilities'
import { queryKeys } from '../../core/query/keys'
import { useSession } from '../../core/providers/session-provider'
import { clearCareActionQueue } from '../../core/storage/care-action-queue'
import { clearPendingCareTaskQueue } from '../../core/foundation/pending-today'
import { clearPendingTimelineEvents } from '../../core/storage/timeline-event-queue'
import { clearStoredScope } from '../../core/scope/scope-provider'
import { clearTodaySnapshots } from '../../core/storage/today-snapshot'
import { clearAuthEmail } from '../../core/storage/auth-email'
import { useTheme } from '../../core/providers/theme-provider'
import { useToast } from '../../core/providers/toast-provider'
import { AppText } from '../../ui/components/app-text'
import { BackHeader } from '../../ui/components/back-header'
import { Button } from '../../ui/components/button'
import { ConfirmDialog } from '../../ui/components/confirm-dialog'
import { LoadingState } from '../../ui/components/loading-state'
import { MoreGroup } from '../../ui/components/more'
import { QueryErrorState } from '../../ui/components/query-error-state'
import { Screen } from '../../ui/components/screen'
import { TextField } from '../../ui/components/text-field'
import { FadeInView } from '../../ui/motion'

const LOCALES = [
  { value: 'zh-CN', label: '简体中文' },
] as const

export function AccountScreen() {
  const { theme } = useTheme()
  const { signOut, status, userId } = useSession()
  const { showToast } = useToast()
  const { caps } = useCapabilities()
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState('')
  const [locale, setLocale] = useState('zh-CN')
  const [savingName, setSavingName] = useState(false)
  const [localePickerOpen, setLocalePickerOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [sessionToRevoke, setSessionToRevoke] = useState<string | null>(null)
  const [revokingOtherSessions, setRevokingOtherSessions] = useState(false)

  const me = useQuery({ queryKey: queryKeys.me, queryFn: () => planetApi.me.get() })
  const sessions = useQuery({ queryKey: queryKeys.sessions, queryFn: () => planetApi.me.sessions() })
  const user = me.data?.user

  useEffect(() => {
    if (!user) return
    setName(user.display_name)
    setLocale(user.locale || 'zh-CN')
  }, [user])

  // Protected layouts normally remove this route when the session changes,
  // but a query can still be resolving during sign-out. Redirect from the
  // screen as well so logout never leaves the user staring at a stale loader.
  if (status === 'unauthenticated') return <Redirect href="/auth" />

  async function saveName() {
    const displayName = name.trim()
    if (!displayName) {
      setNameError('显示名不能为空。')
      showToast({ message: '显示名不能为空。' })
      return
    }
    if (savingName) return
    setNameError('')
    setSavingName(true)
    try {
      await planetApi.me.update({ display_name: displayName })
      await me.refetch()
      showToast({ message: '账户信息已保存。' })
    } catch (e) {
      setNameError(errorMessage(e))
      showToast({ message: errorMessage(e) })
    } finally {
      setSavingName(false)
    }
  }

  async function saveLocale(value: string) {
    const previous = locale
    setLocale(value)
    setLocalePickerOpen(false)
    try {
      await planetApi.me.update({ locale: value })
      await me.refetch()
      showToast({ message: '语言偏好已保存。' })
    } catch (e) {
      setLocale(previous)
      showToast({ message: errorMessage(e) })
    }
  }

  async function revokeSession(sessionId: string) {
    try {
      await planetApi.me.revokeSession(sessionId)
      await sessions.refetch()
      showToast({ message: '已退出该设备。' })
    } catch (e) {
      showToast({ message: errorMessage(e) })
    } finally {
      setSessionToRevoke(null)
    }
  }

  async function revokeOtherSessions() {
    setRevokingOtherSessions(true)
    try {
      await planetApi.me.revokeOtherSessions()
      await sessions.refetch()
      showToast({ message: '其他设备已退出。' })
    } catch (e) {
      showToast({ message: errorMessage(e) })
    } finally {
      setRevokingOtherSessions(false)
    }
  }

  async function onSignOut() {
    setSigningOut(true)
    try {
      await signOut()
    } catch (e) {
      showToast({ message: errorMessage(e) })
    } finally {
      setSigningOut(false)
    }
  }

  async function deleteAccount() {
    if (!user) return
    await planetApi.me.deleteAccount(user.email)
    const deletedUserId = userId
    // Stop authenticated queries before clearing local snapshots. Otherwise an
    // in-flight Today request could write deleted-account data back.
    await signOut()
    if (deletedUserId) {
      await Promise.all([
        clearCareActionQueue(deletedUserId),
        clearPendingCareTaskQueue(deletedUserId),
        clearPendingTimelineEvents(deletedUserId),
        clearStoredScope(deletedUserId),
        clearTodaySnapshots(deletedUserId),
      ])
    }
    await clearAuthEmail()
    router.replace('/account/deleted' as never)
  }

  function sessionActivity(iso: string) {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return '最近活跃时间未知'
    const language = locale === 'en' ? 'en-US' : 'zh-CN'
    return `${locale === 'en' ? 'Last active ' : '最近活跃 '}${new Intl.DateTimeFormat(language, {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: locale === 'en',
    }).format(date)}`
  }

  function deviceLabel(label: string) {
    if (label === 'ios') return 'iPhone / iPad'
    if (label === 'android') return 'Android 设备'
    if (label === 'web') return '浏览器'
    return label || '未知设备'
  }

  if (me.isLoading) {
    return <Screen><BackHeader title="账户与安全" fallbackHref="/more" /><LoadingState label="正在加载账户" /></Screen>
  }
  if (me.error || !user) {
    return (
      <Screen>
        <BackHeader title="账户与安全" fallbackHref="/more" />
        <QueryErrorState error={me.error} message={me.error ? undefined : '无法加载账户信息'} onRetry={() => void me.refetch()} />
      </Screen>
    )
  }

  const localeLabel = LOCALES.find((item) => item.value === locale)?.label ?? locale
  return (
    <Screen>
      <BackHeader title="账户与安全" fallbackHref="/more" />
      <FadeInView>
        <View style={[styles.identity, theme.shadow.card, { backgroundColor: theme.colors.paperStrong, borderColor: theme.colors.line, borderRadius: theme.radius.xl }]}>
          <View style={[styles.avatar, { backgroundColor: theme.colors.sageSoft, borderColor: theme.colors.lineStrong }]}>
            <AppText variant="heading" color={theme.colors.forest2}>{user.display_name.slice(0, 1).toUpperCase()}</AppText>
          </View>
          <View style={styles.identityCopy}>
            <AppText variant="heading">{user.display_name}</AppText>
            <AppText variant="caption" muted>{user.email}</AppText>
          </View>
        </View>
      </FadeInView>

      <MoreGroup label="个人资料">
        <View style={styles.inlineBlock}>
          <TextField label="显示名" value={name} onChangeText={(value) => { setName(value); if (nameError) setNameError('') }} maxLength={80} autoCapitalize="none" trailing={<Button label="保存显示名" busy={savingName} disabled={!name.trim()} onPress={() => void saveName()} />} />
          {nameError ? <AppText accessibilityRole="alert" variant="caption" color={theme.colors.danger}>{nameError}</AppText> : null}
        </View>
        {caps.i18n.length > 1 ? (
          <View style={styles.inlineBlock}>
            <SelectField label="语言" value={localeLabel} onPress={() => setLocalePickerOpen(true)} />
          </View>
        ) : null}
      </MoreGroup>

      <MoreGroup label="安全">
        <View style={styles.sessionHeader}>
          <View style={styles.sessionHeaderCopy}>
            <View style={styles.sessionTitleRow}><ShieldCheck size={18} color={theme.colors.forest2} weight="duotone" /><AppText variant="label">登录设备</AppText></View>
            <AppText variant="caption" muted>发现陌生设备时，可以立即退出它。</AppText>
          </View>
          {sessions.isLoading ? <AppText variant="caption" muted>加载中…</AppText> : null}
        </View>
        {sessions.error ? (
          <View style={styles.sessionError}><AppText accessibilityRole="alert" variant="caption" color={theme.colors.danger}>无法加载登录设备。</AppText><Button label="重试" variant="secondary" onPress={() => void sessions.refetch()} /></View>
        ) : (
          <View style={styles.sessionList}>
            {(sessions.data?.sessions ?? []).map((session) => (
              <View key={session.id} style={[styles.sessionRow, { borderColor: theme.colors.line }]}>
                <View style={[styles.sessionIcon, { backgroundColor: theme.colors.sageSoft }]}><DeviceMobile size={18} color={theme.colors.forest2} weight="duotone" /></View>
                <View style={styles.sessionCopy}>
                  <View style={styles.sessionTitleRow}><AppText variant="label">{deviceLabel(session.device_label)}</AppText>{session.is_current ? <View style={[styles.currentPill, { backgroundColor: theme.colors.sageSoft }]}><AppText variant="caption" color={theme.colors.forest2}>当前设备</AppText></View> : null}</View>
                  <AppText variant="caption" muted>{sessionActivity(session.last_seen_at)}</AppText>
                </View>
                {!session.is_current ? <Pressable accessibilityRole="button" accessibilityLabel={`退出${deviceLabel(session.device_label)}`} onPress={() => setSessionToRevoke(session.id)} style={styles.revokeButton}><AppText variant="caption" color={theme.colors.danger}>退出</AppText></Pressable> : null}
              </View>
            ))}
            {(sessions.data?.sessions ?? []).some((session) => !session.is_current) ? <Button label={revokingOtherSessions ? '退出中…' : '退出其他所有设备'} variant="secondary" busy={revokingOtherSessions} onPress={() => void revokeOtherSessions()} /> : null}
          </View>
        )}
      </MoreGroup>

      <View style={[styles.danger, { backgroundColor: theme.colors.coralSoft, borderColor: theme.colors.dangerLine, borderRadius: theme.radius.xl }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={signingOut ? '退出登录中' : '退出登录'} disabled={signingOut} onPress={() => void onSignOut()} style={styles.signOut}><SignOut size={16} color={theme.colors.forest2} weight="bold" /><AppText variant="label" color={theme.colors.forest2}>{signingOut ? '退出中…' : '退出登录'}</AppText></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="删除账户" accessibilityHint="打开确认对话框，删除后会退出登录" onPress={() => setConfirmDelete(true)} style={styles.deleteLink}><Trash size={16} color={theme.colors.danger} weight="bold" /><AppText variant="label" color={theme.colors.danger}>删除账户</AppText></Pressable>
      </View>

      <ConfirmDialog visible={confirmDelete} title="确认删除账户？" consequence="删除后将退出登录；名下资源按服务端保护期处理。" confirmLabel="删除账户" requireText={user.email} onCancel={() => setConfirmDelete(false)} onConfirm={deleteAccount} />
      <ConfirmDialog visible={Boolean(sessionToRevoke)} title="退出这台设备？" consequence="这台设备上的 PLANET 会话会立即失效，需要重新登录。" confirmLabel="退出设备" onCancel={() => setSessionToRevoke(null)} onConfirm={() => sessionToRevoke ? revokeSession(sessionToRevoke) : undefined} />
      <OptionSheet visible={localePickerOpen} title="语言" onClose={() => setLocalePickerOpen(false)} options={LOCALES.map((item) => ({ value: item.value, label: item.label }))} selected={locale} onSelect={(value) => void saveLocale(value)} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderWidth: StyleSheet.hairlineWidth },
  avatar: { width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  identityCopy: { flex: 1, minWidth: 0, gap: 3 },
  inlineBlock: { gap: 8, paddingHorizontal: 10, paddingVertical: 12 },
  sessionHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingHorizontal: 10, paddingVertical: 12 },
  sessionHeaderCopy: { flex: 1, gap: 4 },
  sessionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sessionList: { gap: 8, paddingHorizontal: 6, paddingBottom: 8 },
  sessionRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  sessionIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sessionCopy: { flex: 1, minWidth: 0, gap: 3 },
  currentPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  revokeButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  sessionError: { gap: 8, paddingHorizontal: 10, paddingBottom: 12 },
  danger: { borderWidth: StyleSheet.hairlineWidth, padding: 6, gap: 2 },
  signOut: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: 14 },
  deleteLink: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: 14 },
})
