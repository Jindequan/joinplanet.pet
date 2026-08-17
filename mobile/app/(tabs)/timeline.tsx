/**
 * Timeline — the pet's long-term data asset (spec §27–§34). Focus input +
 * type filters + a day-grouped event stream (large cards vs compact rows,
 * §29) with cursor pagination (§72) and optimistic inserts (§63).
 */
import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View, type ListRenderItemInfo } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { CalendarDays } from 'lucide-react-native';
import { colors, spacing, typography } from '../../src/theme';
import { EmptyState } from '../../src/components/ui';
import { haptics } from '../../src/lib/haptics';
import { useActivePet } from '../../src/lib/queries';
import {
  TIMELINE_FILTERS,
  timelineFeedKey,
  useTimelineFeed,
  type TimelineFilter,
  type TimelineFilterKey,
} from '../../src/components/timeline/feed';
import {
  DayHeader,
  FeedFooterSkeleton,
  FilterChips,
  TimelineListSkeleton,
  buildTimelineRows,
  isLargeEvent,
  type TimelineRow,
} from '../../src/components/timeline/parts';
import { EventCompactRow, EventLargeCard } from '../../src/components/timeline/event-cards';
import { QuickInputCard } from '../../src/components/timeline/quick-input';

export default function TimelineScreen() {
  const { pet, circle } = useActivePet();
  const tz = circle?.timezone;
  const petId = pet?.id;
  const petName = pet?.name ?? 'your pet';
  const [filter, setFilter] = useState<TimelineFilter>(TIMELINE_FILTERS[0]);

  const feed = useTimelineFeed(petId, filter.types);
  const events = useMemo(
    () => feed.data?.pages.flatMap((page) => page.events) ?? [],
    [feed.data],
  );
  const rows = useMemo(() => buildTimelineRows(events, tz), [events, tz]);

  // Notes are only visible under "All" — the optimistic key mirrors that.
  const optimisticKey =
    petId && filter.key === 'all' ? timelineFeedKey(petId, filter.types) : undefined;

  const selectFilter = (key: TimelineFilterKey) => {
    haptics.select();
    setFilter(TIMELINE_FILTERS.find((f) => f.key === key) ?? TIMELINE_FILTERS[0]);
  };

  const openEvent = (id: string | number) => {
    const key = String(id); // server ids are numeric — normalize before use
    if (key.startsWith('temp-')) return; // optimistic row — wait for the server copy
    router.push(`/event/${encodeURIComponent(key)}`);
  };

  const renderItem = ({ item }: ListRenderItemInfo<TimelineRow>) => {
    if (item.kind === 'day') return <DayHeader label={item.label} />;
    if (isLargeEvent(item.event)) {
      return <EventLargeCard event={item.event} tz={tz} onPress={() => openEvent(item.event.id)} />;
    }
    return <EventCompactRow event={item.event} tz={tz} onPress={() => openEvent(item.event.id)} />;
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Timeline</Text>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        renderItem={renderItem}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
        }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <QuickInputCard petId={petId} petName={petName} optimisticKey={optimisticKey} />
            <FilterChips value={filter.key} onChange={selectFilter} />
          </View>
        }
        ListFooterComponent={feed.isFetchingNextPage ? <FeedFooterSkeleton /> : null}
        ListEmptyComponent={
          feed.isPending ? (
            <TimelineListSkeleton />
          ) : feed.isError ? (
            <EmptyState
              icon={CalendarDays}
              title="Couldn't load the timeline."
              subtitle="Check your connection and try again."
              action={{ label: 'Try again', onPress: () => void feed.refetch() }}
            />
          ) : (
            <EmptyState
              icon={CalendarDays}
              title={`${petName}'s story starts here.`}
              subtitle="Record the first moment — a note, a weight, a photo."
            />
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.s16,
    paddingTop: spacing.s8,
    paddingBottom: spacing.s4,
  },
  title: { flex: 1, ...typography.page, color: colors.text },
  headerBlock: { gap: spacing.s12, marginBottom: spacing.s4 },
  list: {
    paddingHorizontal: spacing.s16,
    paddingBottom: spacing.s32 * 3, // clear the floating tab bar (64 + safe area)
  },
});
