import React, { useEffect, useState } from 'react'
import { Platform, Pressable, Share as RnShare, StyleSheet, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { Copy } from 'phosphor-react-native'
import { createIdempotencyKey, planetApi } from '../../core/api/planet-api'
import { errorMessage } from '../../core/api/errors'
import { appConfig } from '../../core/config'
import { useTheme } from '../../core/providers/theme-provider'
import { useToast } from '../../core/providers/toast-provider'
import { AppText } from '../../ui/components/app-text'
import { Button } from '../../ui/components/button'
import { ChoiceChips } from '../../ui/components/choice-chips'
import { ModalSheet } from '../../ui/components/modal-sheet'
import { getCachedInvite, setCachedInvite } from './invite-cache'

/**
 * 邀请 sheet：大号邀请码 + 系统分享 + 复制。
 * 优先展示本机缓存的现行码（查看无副作用）；「重新生成」是显式操作，
 * 因为服务端只存哈希，重新生成会吊销旧码。
 */
export function InviteSheet({
  visible,
  familyId,
  familyName,
  onClose,
}: {
  visible: boolean
  familyId: string
  familyName: string
  onClose: () => void
}) {
  const { theme } = useTheme()
  const { showToast } = useToast()
  const [code, setCode] = useState('')
  const [role, setRole] = useState<'caregiver' | 'viewer'>('caregiver')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // 保留失败命令的 key：网络超时后点“重试”应取回同一个邀请码，
  // 而不是再次吊销旧码并生成一个用户没拿到的新码。
  const refreshCommandId = React.useRef<string | null>(null)

  const mint = React.useCallback(() => {
    setError('')
    setBusy(true)
    const requestKey = refreshCommandId.current ?? createIdempotencyKey()
    refreshCommandId.current = requestKey
    void planetApi.families
      .refreshInvite(familyId, role, requestKey)
      .then(async (result) => {
        refreshCommandId.current = null
        setCode(result.invite_code)
        await setCachedInvite(familyId, result.invite_code, role)
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setBusy(false))
  }, [familyId, role])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    refreshCommandId.current = null
    setCode('')
    setError('')
    void getCachedInvite(familyId, role).then((cached) => {
      if (cancelled) return
      setCode(cached ?? '')
    })
    return () => {
      cancelled = true
    }
  }, [visible, familyId, role])

  // 先发公开落地页，让被邀请人不用安装 App 或猜下一步；落地页会
  // 预览家庭/宠物并把邀请码带入加入流程。邀请码保留为兜底，兼容
  // 链接被聊天工具截断或接收方暂时无法打开网页的情况。
  const inviteLink = `${appConfig.publicWebBaseUrl}/invite/${encodeURIComponent(code)}`
  const inviteMessage = `加入「${familyName}」的 PLANET 家庭，${role === 'viewer' ? '可以查看所有宠物和照护记录' : '可以一起完成宠物照护'}。打开邀请链接：${inviteLink}\n如果链接未自动打开，也可在 PLANET 里选择「用邀请码加入」，输入：${code}`

  async function shareInvite() {
    const browserCanShare =
      Platform.OS === 'web' &&
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function'

    if (Platform.OS !== 'web' || browserCanShare) {
      try {
        await RnShare.share({ message: inviteMessage })
        return
      } catch {
        // Fall through to the same copy path used by browsers without Web Share.
      }
    }

    try {
      await Clipboard.setStringAsync(inviteMessage)
      showToast({ message: '系统分享不可用，邀请内容已复制' })
    } catch (e) {
      showToast({ message: errorMessage(e) })
    }
  }

  async function copyInviteCode() {
    try {
      await Clipboard.setStringAsync(code)
      showToast({ message: '邀请码已复制' })
    } catch (e) {
      showToast({ message: errorMessage(e) })
    }
  }

  return (
    <ModalSheet visible={visible} onClose={onClose} busy={busy}>
      <AppText variant="eyebrow" soft>
        邀请成员
      </AppText>
      <AppText variant="heading">邀请成员加入家庭</AppText>
      <AppText muted style={{ marginBottom: 4 }}>
        对方在「加入家庭」里输入邀请码即可加入，一个码全家可用。
      </AppText>
      <ChoiceChips
        label="加入后的权限"
        options={[
          { value: 'caregiver', label: '可以参与照护' },
          { value: 'viewer', label: '只查看' },
        ]}
        value={role}
        onChange={setRole}
      />

      {error ? (
        <View style={{ gap: 10 }}>
          <AppText accessibilityRole="alert" color={theme.colors.danger}>{error}</AppText>
          <Button label="重试" variant="secondary" onPress={mint} />
        </View>
      ) : !code && !busy ? (
        <View style={{ gap: 12 }}>
          <AppText muted>本机没有现行邀请码。生成后发给要加入的成员；重新生成会使旧码立即失效。</AppText>
          <Button label="生成邀请码" onPress={mint} />
        </View>
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`邀请码 ${code}，点击复制`}
            disabled={!code}
            onPress={() => void copyInviteCode()}
            style={[
              styles.codeBox,
              {
                backgroundColor: theme.colors.sageSoft,
                borderRadius: theme.radius.lg,
              },
            ]}
          >
            <AppText variant="display" style={styles.code}>
              {busy && !code ? '……' : code}
            </AppText>
            <AppText variant="caption" muted>
              点一下复制
            </AppText>
          </Pressable>

          <View style={styles.actions}>
            <Button
              label="发给成员"
              full
              disabled={!code}
              onPress={() => void shareInvite()}
              style={{ flex: 1 }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="复制邀请码"
              disabled={!code}
              onPress={() => void copyInviteCode()}
              style={[
                styles.copyBtn,
                {
                  backgroundColor: theme.colors.paperStrong,
                  borderColor: theme.colors.line,
                  borderRadius: theme.radius.pill,
                },
              ]}
            >
              <Copy size={18} color={theme.colors.forest2} weight="bold" />
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="重新生成邀请码，旧码将失效"
            disabled={busy}
            onPress={mint}
            hitSlop={8}
            style={styles.regen}
          >
            <AppText variant="caption" muted>
              担心码泄露？<AppText variant="caption" color={theme.colors.forest2}>重新生成</AppText>
              （旧码立即失效）
            </AppText>
          </Pressable>
        </>
      )}
    </ModalSheet>
  )
}

const styles = StyleSheet.create({
  codeBox: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 22,
    paddingHorizontal: 16,
    marginVertical: 6,
  },
  code: {
    letterSpacing: 3,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  copyBtn: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  regen: {
    alignSelf: 'center',
    marginTop: 10,
  },
})
