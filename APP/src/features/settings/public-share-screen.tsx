import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
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

function SharedViewCard({ view, seed }: { view: ShareViewResponse; seed: string }) {
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
  const notes =
    typeof view.data.notes === 'string' && view.data.notes ? view.data.notes : '';
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

      {medications.length > 0 ? (
        <Card style={{ gap: 10 }}>
          <AppText variant="eyebrow" soft>
            用药
          </AppText>
          {medications.map((med, index) => (
            <View key={`${String(med.id ?? index)}`} style={{ gap: 2 }}>
              <AppText variant="label">{String(med.name ?? '药物')}</AppText>
              <AppText muted>
                {[med.dose, med.instructions ?? med.schedule]
                  .filter(Boolean)
                  .map(String)
                  .join(' · ')}
              </AppText>
            </View>
          ))}
        </Card>
      ) : null}

      {events.length > 0 ? (
        <Card style={{ gap: 12 }}>
          <AppText variant="eyebrow" soft>
            最近记录
          </AppText>
          {events.map((event, index) => {
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
          })}
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

      {notes ? (
        <Card style={{ gap: 8 }}>
          <AppText variant="eyebrow" soft>
            备注
          </AppText>
          <AppText>{notes}</AppText>
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

  const query = useQuery({
    queryKey: ['public-share', token],
    queryFn: () => extensionReaders.shareView(token),
    enabled: Boolean(token),
  });

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
        <SharedViewCard view={query.data} seed={token} />
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
