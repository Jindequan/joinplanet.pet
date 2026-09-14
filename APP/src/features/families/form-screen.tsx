import React, { useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { router, useLocalSearchParams } from 'expo-router'
import { CheckCircle } from 'phosphor-react-native'
import { createIdempotencyKey, planetApi } from '../../core/api/planet-api'
import { errorMessage, isApiError } from '../../core/api/errors'
import { invalidateAfterFamilyChange } from '../../core/foundation'
import { useTheme } from '../../core/providers/theme-provider'
import { useToast } from '../../core/providers/toast-provider'
import { useScope } from '../../core/providers/scope-provider'
import { useSession } from '../../core/providers/session-provider'
import { AppText } from '../../ui/components/app-text'
import { BackHeader } from '../../ui/components/back-header'
import { Button } from '../../ui/components/button'
import { Card } from '../../ui/components/card'
import { Screen } from '../../ui/components/screen'
import { FadeInView, hapticSuccess } from '../../ui/motion'
import { TextField } from '../../ui/components/text-field'
import { TimezoneField } from './timezone-picker'
import { setCachedInvite } from './invite-cache'

type Mode = 'create' | 'join'

export function FamilyFormScreen({
  mode,
  initialCode,
  publicEntry = false,
}: {
  mode: Mode
  initialCode?: string
  publicEntry?: boolean
}) {
  return mode === 'create' ? (
    <CreateFamilyScreen />
  ) : (
    <JoinFamilyScreen initialCode={initialCode} publicEntry={publicEntry} />
  )
}

function CreateFamilyScreen() {
  const { theme } = useTheme()
  const { showToast } = useToast()
  const { setScope } = useScope()
  const client = useQueryClient()
  const [name, setName] = useState('')
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const commandId = useRef(createIdempotencyKey())

  async function save() {
    if (!name.trim()) {
      setError('请填写家庭名称。')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await planetApi.families.create(name.trim(), timezone, commandId.current)
      commandId.current = createIdempotencyKey()
      // 播种邀请码：家人随时可以从家庭页邀请，不打断「家庭 → 宠物 → 照护」主路径。
      // 家庭已经在服务端创建成功；邀请码缓存失败不能把成功的创建
      // 伪装成失败，否则用户会重复提交并撞上幂等/状态提示。
      try {
        await setCachedInvite(result.family.id, result.invite_code, 'caregiver')
      } catch {
        // 家庭页仍可显式生成新的邀请码。
      }
      await invalidateAfterFamilyChange(client)
      // Keep the guided flow on the family that was just created. Without this,
      // completing setup can silently return to a previously selected family.
      setScope({ type: 'family', id: result.family.id })
      void hapticSuccess()
      showToast({ message: `「${result.family.name}」已创建，接下来添加宠物。` })
      router.replace(`/pets/new?guided=1&family_id=${encodeURIComponent(result.family.id)}` as never)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <BackHeader
        title="创建家庭"
        fallbackHref="/families"
        eyebrow="先给家庭起个名字"
        subtitle="建好后添加宠物，成员可以一起查看照护安排。"
      />
      <FadeInView>
        <View style={{ gap: 14 }}>
          <TextField
            label="家庭名称"
            value={name}
            maxLength={80}
            onChangeText={(value) => {
              setName(value)
              if (error) setError('')
            }}
            placeholder="如「毛毛的家」"
            autoFocus
          />
          <TimezoneField
            value={timezone}
            onChange={setTimezone}
            hint="默认跟随本机；时区决定「今天」从几点算起。"
          />
          {error ? (
            <AppText accessibilityRole="alert" variant="caption" color={theme.colors.danger}>
              {error}
            </AppText>
          ) : null}
          <Button
            label="创建家庭"
            full
            busy={busy}
            disabled={!name.trim()}
            onPress={() => void save()}
            style={{ marginTop: 4 }}
          />
        </View>
      </FadeInView>
    </Screen>
  )
}

function JoinFamilyScreen({
  initialCode,
  publicEntry = false,
}: {
  initialCode?: string
  publicEntry?: boolean
}) {
  const { theme } = useTheme()
  const { showToast } = useToast()
  const client = useQueryClient()
  const { status } = useSession()
  const { code: inviteCodeParam } = useLocalSearchParams<{ code?: string | string[] }>()
  const [code, setCode] = useState(initialCode?.toUpperCase() ?? '')
  const [preview, setPreview] = useState<{
    role: 'caregiver' | 'viewer'
    petName: string | null
    inviterName: string | null
  } | null>(null)
  const [previewError, setPreviewError] = useState('')
  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [previewAttempt, setPreviewAttempt] = useState(0)
  const commandId = useRef(createIdempotencyKey())
  const previewSeq = useRef(0)

  // Web invite links arrive as /families/join?code=... after login. Seed the
  // form once so the user lands directly on the preview step instead of
  // having to copy the code a second time.
  useEffect(() => {
    const incoming = Array.isArray(inviteCodeParam) ? inviteCodeParam[0] : inviteCodeParam
    if (incoming && !code) setCode(incoming.toUpperCase())
  }, [code, inviteCodeParam])

  // 服务端邀请码固定 10 位；粘贴可能带空格/连字符，先归一化。
  const normalized = code.replace(/[\s-]/g, '').toUpperCase()
  const validCode = /^[A-Z0-9]{10}$/.test(normalized)

  // 输满 10 位后自动预览（防抖 + 竞态保护），输入中途不报「码无效」。
  useEffect(() => {
    const seq = ++previewSeq.current
    setPreview(null)
    setPreviewError('')
    if (!validCode) return
    setChecking(true)
    const timer = setTimeout(() => {
      void planetApi.families
        .invitePreview(normalized)
        .then((result) => {
          if (previewSeq.current !== seq) return
          setPreview({
            role: result.role,
            petName: result.pet_name ?? null,
            inviterName: result.inviter_name ?? null,
          })
        })
        .catch((e) => {
          if (previewSeq.current !== seq) return
          setPreviewError(
            isApiError(e) && e.status === 404
              ? '邀请码无效或已过期，请向家庭管理员确认最新的码。'
              : errorMessage(e),
          )
        })
        .finally(() => {
          if (previewSeq.current === seq) setChecking(false)
        })
    }, 450)
    return () => {
      clearTimeout(timer)
      if (previewSeq.current === seq) setChecking(false)
    }
  }, [normalized, previewAttempt, validCode])

  async function join() {
    if (!validCode) {
      setError('请输入 10 位字母或数字邀请码。')
      return
    }
    if (!preview) {
      setError(previewError || '请先确认邀请码有效。')
      return
    }
    if (status !== 'authenticated') {
      router.replace(`/auth?invite=${encodeURIComponent(normalized)}` as never)
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await planetApi.families.join(normalized, commandId.current)
      commandId.current = createIdempotencyKey()
      await invalidateAfterFamilyChange(client)
      void hapticSuccess()
      showToast({ message: `已加入「${result.family.name}」。` })
      router.replace(`/families/${result.family.id}` as never)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <BackHeader
        title="加入家庭"
        fallbackHref={publicEntry ? '/' : '/families'}
        menu={!publicEntry}
        eyebrow="你收到邀请了"
        subtitle="输入邀请码，先确认家庭再加入"
      />
      <FadeInView>
        <View style={{ gap: 14 }}>
          <TextField
            label="邀请码"
            value={code}
            onChangeText={(value) => {
              setCode(value.toUpperCase())
              if (error) setError('')
            }}
            maxLength={10}
            placeholder="10 位邀请码"
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus={!publicEntry || !initialCode}
          />

          {checking ? (
            <AppText variant="caption" muted>
              正在核对邀请码…
            </AppText>
          ) : preview ? (
            <Card style={styles.previewCard}>
              <CheckCircle size={22} color={theme.colors.mintStrong} weight="fill" />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="heading">
                  {preview.inviterName ? `${preview.inviterName} 邀请你加入` : '邀请码有效'}
                </AppText>
                <AppText variant="caption" muted>
                  {preview.petName
                    ? `加入后，成员都能看到 ${preview.petName} 的照护清单。`
                    : '确认后点下面的按钮加入。'}
                </AppText>
                <AppText variant="caption" color={theme.colors.forest2}>
                  加入后权限：{preview.role === 'viewer' ? '只查看' : '可以参与照护'}
                </AppText>
              </View>
            </Card>
          ) : previewError ? (
            <View style={{ gap: 10 }}>
              <AppText accessibilityRole="alert" variant="caption" color={theme.colors.danger}>
                {previewError}
              </AppText>
              <Button
                label="重试核对"
                variant="secondary"
                onPress={() => setPreviewAttempt((attempt) => attempt + 1)}
              />
            </View>
          ) : null}

          {error ? (
            <AppText accessibilityRole="alert" variant="caption" color={theme.colors.danger}>
              {error}
            </AppText>
          ) : null}

          <Button
            label={
              status === 'authenticated'
                ? preview?.inviterName ? `加入 ${preview.inviterName} 的家庭` : '加入家庭'
                : '登录后加入'
            }
            full
            busy={busy}
            disabled={!validCode || checking || !preview}
            onPress={() => void join()}
            style={{ marginTop: 4 }}
          />
        </View>
      </FadeInView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
})
