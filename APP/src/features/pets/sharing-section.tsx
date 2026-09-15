import React, { useEffect, useRef, useState } from 'react'
import { Platform, Pressable, Share as RnShare, StyleSheet, Switch, View } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as Clipboard from 'expo-clipboard'
import { Check, Trash } from 'phosphor-react-native'
import {
  createIdempotencyKey,
  type Pet,
  type Share,
} from '../../core/api/planet-api'
import { errorMessage } from '../../core/api/errors'
import { appConfig } from '../../core/config'
import { extensionReaders, extensionWriters } from '../../core/extension'
import { invalidateAfterShareChange } from '../../core/foundation'
import { queryKeys } from '../../core/query/keys'
import { useTheme } from '../../core/providers/theme-provider'
import { useToast } from '../../core/providers/toast-provider'
import { AppText } from '../../ui/components/app-text'
import { Button } from '../../ui/components/button'
import { Card } from '../../ui/components/card'
import { ChoiceChips } from '../../ui/components/choice-chips'
import { ConfirmDialog } from '../../ui/components/confirm-dialog'
import { EmptyState } from '../../ui/components/empty-state'
import { LoadingState } from '../../ui/components/loading-state'
import { ModalSheet } from '../../ui/components/modal-sheet'
import { TextField } from '../../ui/components/text-field'
import { FadeInView } from '../../ui/motion'

function formatShareExpiry(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日过期`
}

export function SharingSection({
  pet,
  readOnly = false,
  openSummarySignal = 0,
}: {
  pet: Pet
  readOnly?: boolean
  openSummarySignal?: number
}) {
  const { theme } = useTheme()
  const { showToast } = useToast()
  const client = useQueryClient()
  const query = useQuery({
    queryKey: queryKeys.shares(pet.id),
    queryFn: () => extensionReaders.shares(pet.id),
    enabled: !readOnly,
  })
  const [show, setShow] = useState(false)
  const [showKind, setShowKind] = useState<'care_card' | 'summary'>('care_card')
  const [created, setCreated] = useState('')
  const [confirm, setConfirm] = useState<Share | null>(null)

  function invalidate() {
    invalidateAfterShareChange(client, pet.id)
  }

  useEffect(() => {
    if (readOnly || openSummarySignal <= 0) return
    setShowKind('summary')
    setShow(true)
  }, [openSummarySignal, readOnly])

  if (readOnly) {
    return (
      <Card style={{ gap: 5, backgroundColor: theme.colors.sageSoft }}>
        <AppText variant="label" color={theme.colors.forest2}>外部分享由宠物所有者管理</AppText>
        <AppText variant="caption" muted>
          你仍可以查看家庭内的全部记录；临时只读链接需要宠物所有者创建或撤销。
        </AppText>
      </Card>
    )
  }

  async function shareCreatedLink(link: string) {
    const browserCanShare =
      Platform.OS === 'web' &&
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function'

    if (Platform.OS !== 'web' || browserCanShare) {
      try {
        await RnShare.share({ message: `${pet.name} 的照护信息（只读链接）：${link}` })
        return
      } catch {
        // Fall through to clipboard when native/browser sharing is unavailable.
      }
    }

    try {
      await Clipboard.setStringAsync(link)
      showToast({ message: '系统分享不可用，链接已复制' })
    } catch (e) {
      showToast({ message: errorMessage(e) })
    }
  }

  async function copyShareLink(link: string, message = '已复制到剪贴板。') {
    try {
      await Clipboard.setStringAsync(link)
      showToast({ message })
    } catch (e) {
      showToast({ message: errorMessage(e) })
    }
  }

  if (query.isLoading) {
    return <LoadingState label="正在加载分享链接" compact />
  }
  if (query.error) {
    return (
      <Card>
        <AppText accessibilityRole="alert" color={theme.colors.danger}>{errorMessage(query.error)}</AppText>
        <Button label="重试" onPress={() => void query.refetch()} style={{ marginTop: 10 }} />
      </Card>
    )
  }

  return (
    <View style={{ gap: 16 }}>
      <View style={styles.heading}>
        <View style={{ flex: 1, gap: 4 }}>
          <AppText muted>给寄养、朋友或兽医一条临时只读链接；不含完整病史，到期后自动失效。</AppText>
        </View>
        {!pet.archived_at && !readOnly ? (
          <Button
            label="创建分享"
            onPress={() => {
              setShowKind('care_card')
              setShow(true)
            }}
            style={{ paddingHorizontal: 12 }}
          />
        ) : null}
      </View>

      {created ? (
        <FadeInView>
        <Card style={{ gap: 8, backgroundColor: theme.colors.mint }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Check size={18} color={theme.colors.forest2} weight="bold" />
            <AppText variant="heading">链接已创建</AppText>
          </View>
          <AppText muted>链接只显示一次，请现在发给对方或复制保存。</AppText>
          <Pressable
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="复制分享链接"
            onPress={() => void copyShareLink(created)}
          >
            <AppText variant="caption" color={theme.colors.forest2}>
              {created}
            </AppText>
          </Pressable>
          <Button
            label="发给对方"
            onPress={() => void shareCreatedLink(created)}
          />
        </Card>
        </FadeInView>
      ) : null}

      {(query.data?.shares ?? []).length === 0 ? (
        <EmptyState
          title="没有进行中的分享"
          description="可以为信任的人创建一条临时、只读的照护卡片或健康摘要。"
        />
      ) : (
        <View style={{ gap: 10 }}>
          {(query.data?.shares ?? []).map((share, index) => (
            <FadeInView key={share.id} index={index}>
            <Card style={styles.shareRow}>
              <View style={{ flex: 1, gap: 4 }}>
                <AppText variant="eyebrow" soft>
                  {share.kind === 'care_card'
                    ? '照护卡片'
                    : share.kind === 'summary'
                      ? '健康摘要'
                      : share.kind}
                </AppText>
                <AppText variant="heading">分享链接</AppText>
                <AppText muted>
                  {formatShareExpiry(share.expires_at)} · 已被查看 {share.view_count} 次
                </AppText>
              </View>
              {!readOnly ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="撤销分享"
                  onPress={() => setConfirm(share)}
                  style={styles.iconBtn}
                >
                  <Trash size={18} color={theme.colors.danger} />
                </Pressable>
              ) : null}
            </Card>
            </FadeInView>
          ))}
        </View>
      )}

      {!readOnly ? (
        <ShareForm
          visible={show}
          petId={pet.id}
          initialKind={showKind}
          onClose={() => setShow(false)}
          onSaved={async (token) => {
            // The public web app owns the /s/:token route. Keep generated
            // links aligned with that route so a copied/shared link never
            // lands on a 404 page.
            const link = `${appConfig.publicWebBaseUrl}/s/${token}`
            setCreated(link)
            setShow(false)
            await copyShareLink(link, '分享链接已复制。')
            await invalidate()
          }}
        />
      ) : null}

      <ConfirmDialog
        visible={Boolean(confirm)}
        title="撤销这条分享？"
        consequence="任何拿到链接的人都会立即失去只读访问。"
        confirmLabel="撤销分享"
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return
          await extensionWriters.revokeShare(confirm.id)
          showToast({ message: '分享链接已撤销，外部访问已停止。' })
          setCreated('')
          setConfirm(null)
          await invalidate()
        }}
      />
    </View>
  )
}

function ShareForm({
  visible,
  petId,
  initialKind,
  onClose,
  onSaved,
}: {
  visible: boolean
  petId: string
  initialKind: 'care_card' | 'summary'
  onClose: () => void
  onSaved: (token: string) => void
}) {
  const { theme } = useTheme()
  const [kind, setKind] = useState<'care_card' | 'summary'>(initialKind)
  const [ttl, setTtl] = useState('168')
  const [days, setDays] = useState('90')
  const [reason, setReason] = useState('')
  const [sections, setSections] = useState<string[]>(['profile', 'medications', 'events'])
  const [includePhotos, setIncludePhotos] = useState(false)
  const [step, setStep] = useState<'edit' | 'review'>('edit')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const commandId = useRef(createIdempotencyKey())

  useEffect(() => {
    if (visible) {
      setKind(initialKind)
      setStep('edit')
      setError('')
    }
  }, [initialKind, visible])

  const ttlOptions = [
    ['24', '24 小时'],
    ['72', '3 天'],
    ['168', '7 天'],
    ['720', '30 天'],
  ]
  const rangeOptions = [
    ['30', '近 30 天'],
    ['90', '近 90 天'],
    ['180', '近半年'],
    ['365', '近一年'],
  ]

  async function save() {
    if (kind === 'summary' && sections.length === 0) {
      setError('至少选择一项摘要内容。')
      return
    }
    if (kind === 'summary' && step === 'edit') {
      setError('')
      setStep('review')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await extensionWriters.createShare({
        petId,
        kind,
        ttlHours: Number(ttl),
        options: kind === 'summary'
          ? {
              sections,
              days: Number(days),
              include_photos: includePhotos,
              ...(reason.trim() ? { reason: reason.trim() } : {}),
            }
          : {},
        idempotencyKey: commandId.current,
      })
      commandId.current = createIdempotencyKey()
      onSaved(result.token)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalSheet visible={visible} onClose={onClose} busy={busy}>
      <AppText variant="eyebrow" soft>
        临时访问
      </AppText>
      <AppText variant="heading">创建私密分享</AppText>
      {step === 'edit' ? (
        <ChoiceChips
          label="内容视图"
          options={[
            { value: 'care_card', label: '照护卡片(今日行动)' },
            { value: 'summary', label: '健康摘要' },
          ]}
          value={kind}
          onChange={setKind}
        />
      ) : (
        <AppText variant="caption" muted>健康摘要 · 创建前最后确认</AppText>
      )}
      {kind === 'summary' && step === 'edit' ? (
        <View style={{ gap: 12 }}>
          <TextField
            label="本次就诊主诉 / Why now"
            value={reason}
            onChangeText={setReason}
            placeholder="这次最想和兽医讨论什么？"
            maxLength={300}
            multiline
            style={{ minHeight: 72, textAlignVertical: 'top' }}
          />
          <ChoiceChips
            label="摘要范围"
            options={rangeOptions.map(([value, label]) => ({ value: value!, label: label! }))}
            value={days}
            onChange={setDays}
          />
          <View style={{ gap: 8 }}>
            <AppText variant="label">包含哪些内容</AppText>
            <AppText variant="caption" muted>
              只分享这次就诊需要的资料；过敏会在摘要顶部单独标注。
            </AppText>
            {([
              { value: 'profile', label: '宠物档案', description: '基本信息、过敏、病史和家人备注' },
              { value: 'medications', label: '当前用药', description: '正在使用的药物、剂量和频率' },
              { value: 'events', label: '近期记录', description: '症状、体重、疫苗、驱虫和就诊记录' },
            ] as const).map(({ value, label, description }) => {
              const checked = sections.includes(value)
              return (
                <View
                  key={value}
                  style={[styles.toggleRow, { backgroundColor: theme.colors.sageSoft, borderRadius: theme.radius.md }]}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText variant="label">{label}</AppText>
                    <AppText variant="caption" muted>{description}</AppText>
                  </View>
                  <Switch
                    value={checked}
                    onValueChange={(next) => {
                      setSections((current) => {
                        if (next) return current.includes(value) ? current : [...current, value]
                        return current.filter((item) => item !== value)
                      })
                    }}
                    accessibilityLabel={`包含${label}`}
                    trackColor={{ true: theme.colors.mintStrong, false: theme.colors.line }}
                  />
                </View>
              )
            })}
            {sections.length === 0 ? (
              <AppText accessibilityRole="alert" variant="caption" color={theme.colors.danger}>
                至少选择一项摘要内容。
              </AppText>
            ) : null}
          </View>
          <View
            style={[styles.toggleRow, { backgroundColor: theme.colors.sageSoft, borderRadius: theme.radius.md }]}
            accessibilityLabel="在健康摘要中包含记录照片"
          >
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="label">包含记录照片</AppText>
              <AppText variant="caption" muted>默认关闭；打开后，摘要范围内的照片会一并分享。</AppText>
            </View>
            <Switch
              value={includePhotos}
              onValueChange={setIncludePhotos}
              accessibilityLabel="包含记录照片"
              trackColor={{ true: theme.colors.mintStrong, false: theme.colors.line }}
            />
          </View>
        </View>
      ) : null}
      {kind === 'summary' && step === 'review' ? (
        <View style={{ gap: 10 }}>
          <View style={[styles.reviewCard, { backgroundColor: theme.colors.sageSoft, borderRadius: theme.radius.md }]}>
            <AppText variant="label">这份摘要将包含</AppText>
            <AppText>{sections.map((section) => ({ profile: '宠物档案', medications: '当前用药', events: '近期记录' } as Record<string, string>)[section]).join('、')}</AppText>
            <AppText variant="caption" muted>时间范围：近 {days === '180' ? '半年' : days === '365' ? '一年' : `${days} 天`}</AppText>
            <AppText variant="caption" muted>记录照片：{includePhotos ? '包含' : '不包含'}</AppText>
          </View>
          <View style={[styles.reviewCard, { backgroundColor: theme.colors.sageSoft, borderRadius: theme.radius.md }]}>
            <AppText variant="label">本次就诊主诉</AppText>
            <AppText>{reason.trim() || '未填写；兽医可能需要你现场补充就诊原因。'}</AppText>
          </View>
          <AppText variant="caption" muted>
            创建后会生成一条限时只读链接；拿到链接的人无需注册即可查看这份摘要。
          </AppText>
        </View>
      ) : null}
      <ChoiceChips
        /* 有摘要预览时只保留确认内容，避免用户在创建前无意切换视图类型。 */
        label="有效期"
        options={ttlOptions.map(([value, label]) => ({ value: value!, label: label! }))}
        value={ttl}
        onChange={setTtl}
      />
      <AppText variant="caption" soft>
        {kind === 'summary'
          ? `健康摘要按选定范围生成；照片只有打开“包含记录照片”后才会分享。链接任何人无需注册即可查看；到期或撤销后立即失效。`
          : '照护卡片只含当前照护和今日行动，不含病史。链接任何人无需注册即可查看；到期或撤销后立即失效。'}
      </AppText>
      {error ? (
        <AppText accessibilityRole="alert" variant="caption" color={theme.colors.danger}>
          {error}
        </AppText>
      ) : null}
      <View style={styles.actions}>
        {kind === 'summary' && step === 'review' ? (
          <Button
            label="返回修改"
            variant="secondary"
            onPress={() => {
              setStep('edit')
              setError('')
            }}
            style={{ flex: 1 }}
          />
        ) : (
          <Button label="取消" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
        )}
        <Button
          label={kind === 'summary' && step === 'edit' ? '预览摘要' : '创建链接'}
          busy={busy}
          onPress={() => void save()}
          style={{ flex: 1 }}
        />
      </View>
    </ModalSheet>
  )
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 9 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  reviewCard: { gap: 5, padding: 12 },
})
