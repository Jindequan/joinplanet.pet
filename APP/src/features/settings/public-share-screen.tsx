import React from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { type ShareViewResponse } from '../../core/api/planet-api';
import { extensionReaders } from '../../core/extension';
import { errorMessage, isApiError } from '../../core/api/errors';
import { sexLabel, speciesLabel } from '../../core/display';
import { useTheme } from '../../core/providers/theme-provider';
import { AppText } from '../../ui/components/app-text';
import { Button } from '../../ui/components/button';
import { Card } from '../../ui/components/card';
import { EmptyState } from '../../ui/components/empty-state';
import { LoadingState } from '../../ui/components/loading-state';
import { PageHeader } from '../../ui/components/page-header';
import { PetAvatar } from '../../ui/components/pet-avatar';
import { Screen } from '../../ui/components/screen';
import { FadeInView } from '../../ui/motion';
import { describeEvent } from '../timeline/registry';
import { buildSummaryPdfHtml } from './summary-pdf';

function speciesShort(species: unknown): string {
  return speciesLabel(typeof species === 'string' ? species : undefined);
}

function taskStatusLabel(task: Record<string, unknown>): string {
  const raw =
    typeof task.log_status === 'string'
      ? task.log_status
      : typeof task.status === 'string'
        ? task.status
        : 'pending';
  return (
    ({ done: '已完成', completed: '已完成', skipped: '已跳过' } as Record<string, string>)[raw] ??
    '待完成'
  );
}

function formatCivilDate(civil: string): string {
  const [, m, d] = civil.split('-').map(Number);
  return m && d ? `${m}月${d}日` : civil;
}

function formatExpiry(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatEventDate(iso: unknown): string {
  if (typeof iso !== 'string') return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSharedValue(value: unknown, fallback = '未记录'): string {
  if (Array.isArray(value)) {
    const text = value
      .map((item) =>
        item && typeof item === 'object'
          ? Object.values(item as Record<string, unknown>).filter(Boolean).join(' · ')
          : String(item),
      )
      .filter(Boolean)
      .join('、');
    return text || fallback;
  }
  if (value && typeof value === 'object') {
    const text = Object.values(value as Record<string, unknown>).filter(Boolean).join(' · ');
    return text || fallback;
  }
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function SharedViewCard({
  view,
  seed,
  pdfBusy,
  pdfError,
  onPrintSummary,
}: {
  view: ShareViewResponse;
  seed: string;
  pdfBusy: boolean;
  pdfError: string;
  onPrintSummary: () => void;
}) {
  const { theme } = useTheme();
  const pet =
    view.data.pet && typeof view.data.pet === 'object'
      ? (view.data.pet as Record<string, unknown>)
      : {};
  const tasks = Array.isArray(view.data.tasks)
    ? view.data.tasks.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object',
      )
    : [];
  const medications = Array.isArray(view.data.medications)
    ? view.data.medications.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object',
      )
    : [];
  const contacts = Array.isArray(view.data.emergency_contacts)
    ? view.data.emergency_contacts.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object',
      )
    : [];
  const decisionMaker =
    view.data.med_decision_maker && typeof view.data.med_decision_maker === 'object'
      ? (view.data.med_decision_maker as Record<string, unknown>)
      : {};
  const decisionMakerName = typeof decisionMaker.name === 'string' ? decisionMaker.name.trim() : '';
  const decisionMakerContact = [decisionMaker.phone, decisionMaker.email]
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    .map((value) => value.trim())
    .join(' · ');
  const notes =
    typeof view.data.notes === 'string' && view.data.notes ? view.data.notes : '';
  const reason =
    typeof view.data.reason === 'string' && view.data.reason ? view.data.reason : '';
  const hasSummaryField = (field: string) =>
    view.kind === 'summary' && Object.prototype.hasOwnProperty.call(view.data, field);
  const hasProfile =
    hasSummaryField('allergies') || hasSummaryField('conditions') || hasSummaryField('notes');
  const events = Array.isArray(view.data.events)
    ? view.data.events.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object',
      )
    : [];
  const date =
    typeof view.data.date === 'string' && view.data.date ? view.data.date : '';

  return (
    <View style={{ gap: 14 }}>
      <Card style={{ gap: 8, alignItems: 'flex-start' }}>
        {/* 载荷不含宠物 id（不泄露内部 ID），用分享 token 作配色种子，同一链接形象稳定。 */}
        <PetAvatar
          petId={seed}
          species={typeof pet.species === 'string' ? pet.species : undefined}
          size={56}
          decorative
        />
        <AppText variant="eyebrow" soft>
          {speciesShort(pet.species)}
        </AppText>
        <AppText variant="title">{String(pet.name ?? '共享宠物档案')}</AppText>
        <AppText muted>
          {[pet.breed, sexLabel(typeof pet.sex === 'string' ? pet.sex : undefined)]
            .filter(Boolean)
            .map(String)
            .join(' · ') || '共享的照护信息'}
        </AppText>
      </Card>

      {date ? (
        <Card style={{ gap: 10 }}>
          <AppText variant="eyebrow" soft>
            今日照护
          </AppText>
          <AppText muted>{formatCivilDate(date)}</AppText>
          {tasks.length ? (
            tasks.map((task, index) => (
              <View key={`${String(task.id ?? index)}`} style={styles.rowBetween}>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="label">{String(task.title ?? '照护事项')}</AppText>
                  <AppText variant="caption" muted>
                    {taskStatusLabel(task)}
                  </AppText>
                </View>
                <AppText variant="caption" muted>
                  {String(task.time_of_day ?? '时间未定')}
                </AppText>
              </View>
            ))
          ) : (
            <AppText muted>今天没有安排照护。</AppText>
          )}
        </Card>
      ) : null}

      {view.kind === 'summary' ? (
        <Card style={{ gap: 8 }}>
          <AppText variant="eyebrow" soft>
            本次就诊主诉 / Why now
          </AppText>
          <AppText>{reason || '未填写；请在就诊前补充最想和兽医讨论的问题。'}</AppText>
        </Card>
      ) : null}

      {hasProfile ? (
        <Card style={{ gap: 10 }}>
          <AppText variant="eyebrow" soft>
            过敏与既往病史
          </AppText>
          <AppText variant="label">过敏（请先告知兽医）</AppText>
          <AppText>{formatSharedValue(view.data.allergies, '未记录过敏信息')}</AppText>
          <AppText variant="label">慢性病 / 既往史</AppText>
          <AppText>{formatSharedValue(view.data.conditions)}</AppText>
        </Card>
      ) : null}

      {hasSummaryField('medications') ? (
        <Card style={{ gap: 10 }}>
          <AppText variant="eyebrow" soft>
            用药
          </AppText>
          {medications.length > 0 ? medications.map((med, index) => (
              <View key={`${String(med.id ?? index)}`} style={{ gap: 2 }}>
                <AppText variant="label">{String(med.name ?? '药物')}</AppText>
                <AppText muted>
                  {[med.dose, med.instructions ?? med.schedule]
                    .filter(Boolean)
                    .map(String)
                    .join(' · ')}
                </AppText>
              </View>
            )) : <AppText muted>当前没有记录用药。</AppText>}
        </Card>
      ) : null}

      {hasSummaryField('events') ? (
        <Card style={{ gap: 12 }}>
          <AppText variant="eyebrow" soft>
            最近记录
          </AppText>
          {events.length > 0 ? events.map((event, index) => {
            const type = typeof event.type === 'string' ? event.type : 'note';
            const payload =
              event.payload && typeof event.payload === 'object'
                ? (event.payload as Record<string, unknown>)
                : {};
            const description = describeEvent(type, payload);
            const photoData =
              typeof payload.photo_data === 'string' ? payload.photo_data : '';
            return (
              <View
                key={`${type}-${String(event.occurred_at ?? index)}-${index}`}
                style={[styles.eventRow, { borderTopColor: theme.colors.line }]}
              >
                <View style={styles.eventTopline}>
                  <AppText variant="label">{description.category}</AppText>
                  <AppText variant="caption" muted>{formatEventDate(event.occurred_at)}</AppText>
                </View>
                {description.headline ? <AppText>{description.headline}</AppText> : null}
                {description.detail ? <AppText variant="caption" muted>{description.detail}</AppText> : null}
                {photoData ? (
                  <Image
                    source={{ uri: photoData }}
                    accessibilityLabel="共享记录中的照片"
                    style={styles.eventPhoto}
                    resizeMode="cover"
                  />
                ) : null}
              </View>
            );
          }) : <AppText muted>所选时间范围内没有记录。</AppText>}
        </Card>
      ) : null}

      {contacts.length > 0 ? (
        <Card style={{ gap: 10 }}>
          <AppText variant="eyebrow" soft>
            紧急联系人
          </AppText>
          {contacts.map((contact, index) => (
            <View key={`${String(contact.name ?? index)}`} style={{ gap: 2 }}>
              <AppText variant="label">{String(contact.name ?? '联系人')}</AppText>
              <AppText muted>{String(contact.phone ?? contact.email ?? '')}</AppText>
            </View>
          ))}
        </Card>
      ) : null}

      {decisionMakerName || decisionMakerContact ? (
        <Card style={{ gap: 8 }}>
          <AppText variant="eyebrow" soft>
            医疗决定人
          </AppText>
          <AppText variant="label">{decisionMakerName || '已指定联系人'}</AppText>
          {decisionMakerContact ? <AppText muted>{decisionMakerContact}</AppText> : null}
          <AppText variant="caption" muted>
            涉及用药或紧急治疗时，请先联系这位决定人。
          </AppText>
        </Card>
      ) : null}

      {notes ? (
        <Card style={{ gap: 8 }}>
          <AppText variant="eyebrow" soft>
            备注
          </AppText>
          <AppText>{notes}</AppText>
        </Card>
      ) : null}

      {view.kind === 'summary' ? (
        <Card style={{ gap: 8 }}>
          <AppText variant="eyebrow" soft>
            带去就诊
          </AppText>
          <AppText variant="caption" muted>
            生成一份适合打印的 A4 健康摘要，或保存为 PDF 发给兽医。
          </AppText>
          {pdfError ? (
            <AppText accessibilityRole="alert" variant="caption" color={theme.colors.danger}>
              {pdfError}
            </AppText>
          ) : null}
          <Button
            label="打印 / 保存 PDF"
            busy={pdfBusy}
            accessibilityState={{ busy: pdfBusy }}
            onPress={onPrintSummary}
          />
        </Card>
      ) : null}

      <AppText muted>这个只读视图将于 {formatExpiry(view.expires_at)} 过期。</AppText>
    </View>
  );
}

export function PublicShareScreen() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = typeof params.token === 'string' ? params.token : '';
  const [pdfBusy, setPdfBusy] = React.useState(false);
  const [pdfError, setPdfError] = React.useState('');

  const query = useQuery({
    queryKey: ['public-share', token],
    queryFn: () => extensionReaders.shareView(token),
    enabled: Boolean(token),
  });

  async function printSummary() {
    if (!query.data || query.data.kind !== 'summary' || pdfBusy) return;
    setPdfBusy(true);
    setPdfError('');
    try {
      const html = buildSummaryPdfHtml(query.data);
      if (Platform.OS === 'web') {
        if (typeof window === 'undefined' || typeof window.print !== 'function') {
          throw new Error('当前浏览器不支持打印');
        }
        window.print();
        return;
      }
      const result = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, {
          mimeType: 'application/pdf',
          dialogTitle: '分享健康摘要 PDF',
          UTI: 'com.adobe.pdf',
        });
      } else {
        await Print.printAsync({ html });
      }
    } catch (error) {
      setPdfError(errorMessage(error, '暂时无法生成 PDF，请重试。'));
    } finally {
      setPdfBusy(false);
    }
  }

  if (!token) {
    return (
      <Screen>
        <EmptyState
          title="分享链接无效"
          description="请检查链接是否完整，或让分享人重新生成一条链接。"
        />
      </Screen>
    );
  }

  if (query.isLoading) {
    return (
      <Screen>
        <PageHeader eyebrow="只读快照" title="共享的照护信息" />
        <LoadingState label="正在加载分享内容" />
      </Screen>
    );
  }

  if (query.error) {
    const expired = isApiError(query.error) && query.error.status === 410;
    return (
      <Screen>
        <EmptyState
          title={expired ? '分享已过期' : '分享不可用'}
          description={
            expired
              ? '链接已失效或被管理员撤销。'
              : errorMessage(query.error, '这条链接已经不可访问。')
          }
          action={!expired ? <Button label="重试" onPress={() => void query.refetch()} /> : undefined}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.brand}>
        <AppText variant="heading" color={theme.colors.forest2}>
          PLANET
        </AppText>
      </View>
      <PageHeader
        eyebrow="只读照护视图"
        title="共享的照护信息"
        description="凭链接查看，无需注册；内容来自分享人生成的只读快照，此页无法修改任何记录。"
      />
      <FadeInView>
      {query.data ? (
        <SharedViewCard
          view={query.data}
          seed={token}
          pdfBusy={pdfBusy}
          pdfError={pdfError}
          onPrintSummary={() => void printSummary()}
        />
      ) : (
        <EmptyState
          title="暂时没有可显示的内容"
          description="这条分享还没有返回照护信息，请稍后重试。"
          action={<Button label="重试" onPress={() => void query.refetch()} />}
        />
      )}
      </FadeInView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center', marginBottom: 4 },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  eventRow: {
    gap: 4,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  eventTopline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  eventPhoto: {
    width: '100%',
    height: 180,
    borderRadius: 14,
    marginTop: 4,
  },
});
