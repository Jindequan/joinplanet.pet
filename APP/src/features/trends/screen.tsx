import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { type TimelineEvent } from '../../core/api/planet-api';
import { errorMessage } from '../../core/api/errors';
import { extensionReaders } from '../../core/extension';
import { foundationReaders } from '../../core/foundation';
import { speciesLabel } from '../../core/display';
import { queryKeys } from '../../core/query/keys';
import { useTheme } from '../../core/providers/theme-provider';
import { civilDateInTimezone, civilToday, localCivilDate } from '../../core/time/civil';
import { resolvePetTimezone } from '../../core/providers/scope-provider';
import { useScope } from '../../core/scope/scope-provider';
import { trendsPageHint } from '../../core/voice';
import { AppText } from '../../ui/components/app-text';
import { BackHeader } from '../../ui/components/back-header';
import { Button } from '../../ui/components/button';
import { Card } from '../../ui/components/card';
import { ChoiceChips } from '../../ui/components/choice-chips';
import { EmptyState } from '../../ui/components/empty-state';
import { LoadingState } from '../../ui/components/loading-state';
import { PetAvatar } from '../../ui/components/pet-avatar';
import { QueryErrorState } from '../../ui/components/query-error-state';
import { ScopeCascade } from '../../ui/components/scope-cascade';
import { Screen } from '../../ui/components/screen';
import { WeightChart, type WeightPoint } from '../../ui/components/weight-chart';
import { FadeInView } from '../../ui/motion';

const RANGES = [
  { key: '1m', label: '近一个月', days: 30 },
  { key: '3m', label: '三个月', days: 90 },
  { key: '6m', label: '六个月', days: 180 },
  { key: '1y', label: '一年', days: 365 },
] as const;

type RangeKey = (typeof RANGES)[number]['key'];

function civilFromDays(days: number, timezone?: string): string {
  const date = new Date(Date.now() - days * 86_400_000);
  return timezone ? civilDateInTimezone(timezone, date) : localCivilDate(date);
}

export function TrendsScreen() {
  const { theme } = useTheme();
  const { scope } = useScope();
  const [rangeKey, setRangeKey] = useState<RangeKey>('1m');
  const range = RANGES.find((item) => item.key === rangeKey) ?? RANGES[0];

  const pets = useQuery({
    queryKey: queryKeys.accessiblePets,
    queryFn: () => foundationReaders.accessiblePets(),
  });
  const families = useQuery({
    queryKey: queryKeys.families,
    queryFn: () => foundationReaders.families(),
  });

  const scopeId = scope.type === 'all' ? '' : scope.id;
  const allPets = pets.data?.pets ?? [];
  const selectedPet = scope.type === 'pet'
    ? allPets.find((pet) => pet.id === scope.id)
    : undefined;
  const statsTimezone = scope.type === 'family'
    ? families.data?.families.find((family) => family.id === scope.id)?.timezone
    : scope.type === 'pet'
      ? resolvePetTimezone(selectedPet?.family_ids, families.data?.families ?? [], scope.familyId)
      : undefined;
  const statsToday = statsTimezone ? civilDateInTimezone(statsTimezone) : civilToday();
  const petFamilyId = scope.type === 'family'
    ? scope.id
    : scope.type === 'pet'
      ? scope.familyId
      : undefined;
  const eventsQuery = useQuery({
    queryKey: ['trends-events', scope.type, scopeId, range.key],
    queryFn: () =>
      extensionReaders.timelineInRange({
        scopeType: scope.type,
        scopeId: scope.type === 'all' ? undefined : scope.id,
        startMs: Date.now() - range.days * 86_400_000,
      }),
  });
  const statsQuery = useQuery({
    // The server interprets civil dates in the selected Family timezone. Keep
    // the resolved timezone/date in the key so the first device-timezone
    // request cannot remain cached after Family data arrives.
    queryKey: ['care-stats', scope.type, scopeId, range.key, statsTimezone ?? 'device', statsToday],
    queryFn: () =>
      extensionReaders.careStats({
        from: civilFromDays(range.days, statsTimezone),
        to: statsToday,
        family_id: scope.type === 'family' ? scope.id : undefined,
        pet_id: scope.type === 'pet' ? scope.id : undefined,
      }),
  });

  const petsInScope =
    scope.type === 'pet'
      ? allPets.filter((pet) => pet.id === scope.id)
      : scope.type === 'family'
        ? allPets.filter(
            (pet) => !pet.archived_at && (pet.family_ids ?? []).includes(scope.id),
          )
        : allPets.filter((pet) => !pet.archived_at);
  const loading = pets.isLoading || families.isLoading || eventsQuery.isLoading;
  const loadError = pets.error ?? families.error ?? eventsQuery.error;
  const events = eventsQuery.data ?? [];
  const eventsByPet = new Map<string, TimelineEvent[]>();
  for (const event of events) {
    const list = eventsByPet.get(event.pet_id) ?? [];
    list.push(event);
    eventsByPet.set(event.pet_id, list);
  }

  return (
    <Screen>
      <BackHeader title="趋势" subtitle={trendsPageHint()} fallbackHref="/more" />
      <ScopeCascade variant="page" alwaysVisible />
      <ChoiceChips
        label="时间范围"
        options={RANGES.map((item) => ({ value: item.key, label: item.label }))}
        value={rangeKey}
        onChange={setRangeKey}
      />

      {loading ? (
        <LoadingState label="正在加载趋势" />
      ) : loadError ? (
        <QueryErrorState
          error={loadError}
          onRetry={() => {
            void pets.refetch();
            void families.refetch();
            void eventsQuery.refetch();
          }}
        />
      ) : (
        <FadeInView>
      <Card style={styles.summary}>
        {statsQuery.isLoading ? (
          <AppText muted>正在汇总照护统计…</AppText>
        ) : statsQuery.error ? (
          <View style={{ gap: 8 }}>
            <AppText accessibilityRole="alert" color={theme.colors.danger}>{errorMessage(statsQuery.error)}</AppText>
            <Button label="重试" onPress={() => void statsQuery.refetch()} />
          </View>
        ) : (
          <View style={{ gap: 8 }}>
          <View style={styles.summaryRow}>
            <SummaryCell
              value={
                statsQuery.data?.rate === null || statsQuery.data?.rate === undefined
                  ? '—'
                  : `${statsQuery.data.rate}%`
              }
              label="按时完成率"
            />
            <SummaryCell value={String(statsQuery.data?.completed ?? 0)} label="完成" />
              <SummaryCell value={String(statsQuery.data?.missed ?? 0)} label="未完成" />
              <SummaryCell value={String(events.length)} label="记录" />
          </View>
            <AppText variant="caption" muted>
              只统计已完成和未完成，跳过不计入。
            </AppText>
          </View>
        )}
      </Card>

      {petsInScope.length === 0 ? (
        <EmptyState
          title="这个范围还没有活跃的宠物"
          description="去「宠物」页添加，或切换上方范围。"
        />
      ) : (
        <View style={{ gap: 14 }}>
          {petsInScope.map((pet) => (
            <TrendPetCard
              key={pet.id}
              petId={pet.id}
              name={pet.name}
              species={pet.species}
              events={eventsByPet.get(pet.id) ?? []}
              onOpenPet={() => router.push(`/pets/${pet.id}${petFamilyId && (pet.family_ids ?? []).includes(petFamilyId) ? `?familyId=${encodeURIComponent(petFamilyId)}` : ''}` as never)}
              onOpenRecords={() => router.push(`/pets/${pet.id}/timeline${petFamilyId && (pet.family_ids ?? []).includes(petFamilyId) ? `?familyId=${encodeURIComponent(petFamilyId)}` : ''}` as never)}
            />
          ))}
        </View>
      )}
        </FadeInView>
      )}
    </Screen>
  );
}

function SummaryCell({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.summaryCell}>
      <AppText variant="heading">{value}</AppText>
      <AppText variant="caption" muted>
        {label}
      </AppText>
    </View>
  );
}

function TrendPetCard({
  petId,
  name,
  species,
  events,
  onOpenPet,
  onOpenRecords,
}: {
  petId: string;
  name: string;
  species?: string;
  events: TimelineEvent[];
  onOpenPet: () => void;
  onOpenRecords: () => void;
}) {
  const { theme } = useTheme();
  const weights: WeightPoint[] = events
    .filter((event) => event.type === 'weight' && typeof event.payload?.weight_g === 'number')
    .map((event) => ({
      id: event.id,
      occurred_at: event.occurred_at,
      weight_g: event.payload.weight_g as number,
    }))
    .sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());

  const firstWeight = weights[0];
  const lastWeight = weights.at(-1);
  const weightDelta =
    firstWeight && lastWeight && weights.length >= 2
      ? Math.round(((lastWeight.weight_g - firstWeight.weight_g) / 1000) * 100) / 100
      : null;

  const completed = events.filter(
    (event) =>
      event.type === 'care_task_completed' && event.payload?.status !== 'skipped',
  ).length;
  const skipped = events.filter(
    (event) =>
      event.type === 'care_task_completed' && event.payload?.status === 'skipped',
  ).length;

  return (
    <Card style={{ gap: 12 }}>
      <View style={styles.petHead}>
        <PetAvatar petId={petId} species={species} size={44} decorative />
        <View style={styles.petCopy}>
          <AppText variant="heading">{name}</AppText>
          <AppText variant="caption" muted>
            {speciesLabel(species)}
          </AppText>
        </View>
        {weightDelta !== null && weightDelta !== 0 ? (
          <View
            style={[
              styles.delta,
              {
                backgroundColor: weightDelta > 0 ? theme.colors.mint : theme.colors.coralSoft,
                borderRadius: theme.radius.pill,
              },
            ]}
          >
            <AppText variant="caption" color={theme.colors.forest2}>
              体重 {weightDelta > 0 ? '↗' : '↘'} {Math.abs(weightDelta)} kg
            </AppText>
          </View>
        ) : null}
      </View>

      {weights.length >= 2 ? (
        <WeightChart points={weights} />
      ) : (
        <AppText variant="caption" muted>
          {weights.length === 1 && weights[0]
            ? `本区间只记了 1 次体重（${Math.round((weights[0].weight_g / 1000) * 10) / 10} kg），再记一次就能看到曲线。`
            : '这段时间没有体重记录。'}
        </AppText>
      )}

      <View style={styles.stats}>
        <StatRow label="照护" value={`${completed} 完成 · ${skipped} 跳过`} />
      </View>
      <AppText variant="caption" muted>
        数据来源 · {name} 的时间线与照护记录
      </AppText>
      <Button
        label={`打开 ${name} 的宠物工作区`}
        onPress={onOpenPet}
        full
      />
      <Button
        label="查看这只宠物的记录"
        variant="ghost"
        onPress={onOpenRecords}
        full
      />
    </Card>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <AppText variant="caption" muted>
        {label}
      </AppText>
      <AppText variant="label">{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { gap: 8 },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  summaryCell: {
    minWidth: '40%',
    flexGrow: 1,
    gap: 2,
  },
  petHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  petCopy: { flex: 1, gap: 2 },
  delta: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  stats: { gap: 8 },
  statRow: { gap: 2 },
});
