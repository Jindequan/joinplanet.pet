/**
 * Today (spec §16–§26) — the make-or-break screen: "what's left for Milo today?"
 * Daypart-grouped routine, one-tap optimistic completion + Undo toast (no
 * confirm modals), swipe-to-skip with a restorable fold, template-driven add
 * sheet, pull-to-refresh + focus revalidation (multi-caregiver, spec §66) and
 * the text share card. All dates/clocks run in the circle timezone (spec §75).
 */
import React, { useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { ChevronDown, ChevronUp, Dog, Plus } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '../../src/theme';
import { Chip, EmptyState, SecondaryButton, SectionHeader, Skeleton } from '../../src/components/ui';
import { useToast } from '../../src/components/toast';
import { haptics } from '../../src/lib/haptics';
import {
  qk,
  useActivePet,
  useCompleteTask,
  useCreateTask,
  useSkipTask,
  useToday,
  useUndoLog,
  type TodayTask,
} from '../../src/lib/queries';
import { Hero } from '../../src/components/today/hero';
import { SkippedRow, TaskRow, type TaskRowActions } from '../../src/components/today/task-row';
import {
  AddTaskSheetScrollable,
  TASK_TEMPLATES,
  type TaskTemplate,
} from '../../src/components/today/add-task-sheet';
import {
  DAYPART_LABEL,
  DAYPART_ORDER,
  daypartOf,
  todayInZone,
} from '../../src/components/today/time';

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const {
    pet,
    circle,
    isLoading: meLoading,
    isError: meError,
    refetch: refetchMe,
  } = useActivePet();
  const petId = pet?.id;
  const petName = pet?.name ?? '';
  const timezone = circle?.timezone ?? null;

  // Circle-local "today" keeps query + log dates aligned (contract F4, spec §76).
  const date = useMemo(() => todayInZone(timezone), [timezone]);

  const today = useToday(petId, date);
  const tasks = today.data?.tasks ?? [];

  const complete = useCompleteTask(petId, date);
  const skip = useSkipTask(petId, date);
  const undo = useUndoLog(petId, date);
  const createTask = useCreateTask(petId, date);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [skippedOpen, setSkippedOpen] = useState(false);
  const sheetRef = useRef<BottomSheetModal>(null);
  const [preset, setPreset] = useState<TaskTemplate | null>(null);

  // Focus → revalidate: 2–4 caregiver families reconcile without websockets (spec §66).
  useFocusEffect(
    React.useCallback(() => {
      if (petId) void queryClient.invalidateQueries({ queryKey: qk.today(petId, date) });
    }, [queryClient, petId, date]),
  );

  const groups = useMemo(
    () =>
      DAYPART_ORDER.map((part) => ({
        part,
        tasks: tasks
          .filter((t) => !t.log || t.log.status === 'done') // skipped lives in the fold
          .filter((t) => daypartOf(t.time_of_day) === part)
          .sort((a, b) => a.time_of_day.localeCompare(b.time_of_day)),
      })).filter((g) => g.tasks.length > 0),
    [tasks],
  );

  const doneCount = tasks.filter((t) => t.log?.status === 'done').length;
  const skippedTasks = tasks.filter((t) => t.log?.status === 'skipped');

  /* ------------------------------ interactions ----------------------------- */

  const handleComplete = (task: TodayTask) => {
    haptics.complete(); // light (spec §78)
    complete.mutate(
      { taskId: task.id },
      {
        // hook rolls the optimistic log back; 409s are adopted as success (spec §21)
        onError: () =>
          toast({
            message: `Couldn't update ${task.title}.`,
            action: { label: 'Retry', onPress: () => handleComplete(task) },
          }),
      },
    );
    toast({
      message: `${task.title} completed`,
      action: { label: 'Undo', onPress: () => undo.mutate({ taskId: task.id }) },
      duration: 4000, // spec §20
    });
  };

  const handleSkip = (task: TodayTask) => {
    haptics.light();
    skip.mutate(
      { taskId: task.id },
      {
        onError: () =>
          toast({
            message: `Couldn't skip ${task.title}.`,
            action: { label: 'Retry', onPress: () => handleSkip(task) },
          }),
      },
    );
    toast({
      message: `${task.title} skipped`,
      action: { label: 'Undo', onPress: () => undo.mutate({ taskId: task.id }) },
      duration: 4000,
    });
  };

  const handleUndo = (task: TodayTask) => {
    haptics.light();
    undo.mutate(
      { taskId: task.id },
      { onError: () => toast({ message: `Couldn't undo ${task.title}.` }) },
    );
  };

  /** spec §26 — formatted text share via the system sheet (graphic card is a TODO). */
  const handleShare = async () => {
    // TODO(spec §26): swap for a rendered image card via react-native-view-shot
    // once the package is added; this text card is the sanctioned fallback.
    const lines = tasks.map((t) => {
      if (t.log?.status === 'done') {
        return `✓ ${t.title}${t.log.by_name ? ` · ${t.log.by_name}` : ''}`;
      }
      if (t.log?.status === 'skipped') return `— ${t.title} · skipped`;
      return `○ ${t.title}`;
    });
    const message = [`${petName || 'Your pet'} · Today`, '', ...lines, '', 'PLANET'].join('\n');
    try {
      await Share.share({ message, title: `${petName}'s day` });
    } catch {
      // user dismissed the share sheet — not an error
    }
  };

  const openSheet = (template: TaskTemplate | null = null) => {
    haptics.light();
    setPreset(template);
    sheetRef.current?.present();
  };

  /** Empty-state chips create instantly; Custom opens the sheet (needs a name). */
  const handleQuickCreate = (template: TaskTemplate) => {
    if (template.key === 'custom') {
      openSheet(template);
      return;
    }
    haptics.light();
    createTask.mutate(
      { title: template.title, time_of_day: template.time },
      {
        onSuccess: () => toast({ message: `${template.title} added` }),
        onError: () =>
          toast({
            message: `Couldn't add ${template.title}.`,
            action: { label: 'Retry', onPress: () => handleQuickCreate(template) },
          }),
      },
    );
  };

  const rowActions: TaskRowActions = {
    onComplete: handleComplete,
    onSkip: handleSkip,
    onUndo: handleUndo,
  };

  const onRefresh = () => {
    void today.refetch();
    void refetchMe();
  };
  const refreshing = today.isRefetching && !today.isLoading;

  /* -------------------------------- render --------------------------------- */

  const wrapper = (children: React.ReactNode) => (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {children}
    </SafeAreaView>
  );

  const firstLoad = meLoading || (today.isLoading && !!petId);
  if (firstLoad) {
    return wrapper(
      <ScrollView contentContainerStyle={styles.content}>
        <TodaySkeleton />
      </ScrollView>,
    );
  }

  if (meError && !pet) {
    return wrapper(
      <View style={styles.centered}>
        <EmptyState
          title="Couldn't load today."
          subtitle="Your records are safe."
          action={{ label: 'Try again', onPress: () => void refetchMe() }}
        />
      </View>,
    );
  }

  if (!petId || !pet) {
    return wrapper(
      <View style={styles.centered}>
        <EmptyState
          icon={Dog}
          title="No pet yet"
          subtitle="Create your pet's care circle to start caring."
        />
      </View>,
    );
  }

  if (today.isError) {
    return wrapper(
      <View style={styles.centered}>
        <EmptyState
          title="Couldn't load today."
          subtitle="Your records are safe."
          action={{ label: 'Try again', onPress: () => void today.refetch() }}
        />
      </View>,
    );
  }

  return wrapper(
    <>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.s40 + 84 }, // clear the floating tab bar
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.brand500}
            colors={[colors.brand500]}
          />
        }
      >
        <Hero
          petName={petName}
          avatarKey={pet.avatar_key}
          timezone={timezone}
          done={doneCount}
          total={tasks.length}
          onShare={() => void handleShare()}
        />

        {tasks.length === 0 ? (
          <View style={styles.emptyBlock}>
            <EmptyState
              title={`Nothing on ${petName}'s schedule yet.`}
              subtitle={`What does ${petName} do every day?`}
            />
            <View style={styles.chipRow}>
              {TASK_TEMPLATES.filter((t) => t.key !== 'dinner').map((t) => (
                <Chip key={t.key} label={t.label} onPress={() => handleQuickCreate(t)} />
              ))}
            </View>
          </View>
        ) : (
          <>
            {groups.map((group) => (
              <View key={group.part} style={styles.group}>
                <SectionHeader title={DAYPART_LABEL[group.part]} />
                <View style={styles.groupCard}>
                  {group.tasks.map((task, i) => (
                    <React.Fragment key={task.id}>
                      {i > 0 ? <View style={styles.rowDivider} /> : null}
                      <TaskRow task={task} timezone={timezone} actions={rowActions} />
                    </React.Fragment>
                  ))}
                </View>
              </View>
            ))}

            {skippedTasks.length > 0 ? (
              <View style={styles.group}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Skipped tasks, ${skippedTasks.length}. ${
                    skippedOpen ? 'Collapse' : 'Expand'
                  }`}
                  onPress={() => {
                    haptics.select();
                    setSkippedOpen((o) => !o);
                  }}
                  style={({ pressed }) => [styles.skippedToggle, pressed && { opacity: 0.6 }]}
                >
                  <Text style={styles.skippedToggleLabel}>Skipped ({skippedTasks.length})</Text>
                  {skippedOpen ? (
                    <ChevronUp size={16} color={colors.textSecondary} />
                  ) : (
                    <ChevronDown size={16} color={colors.textSecondary} />
                  )}
                </Pressable>
                {skippedOpen ? (
                  <View style={styles.groupCard}>
                    {skippedTasks.map((task, i) => (
                      <React.Fragment key={task.id}>
                        {i > 0 ? <View style={styles.rowDivider} /> : null}
                        <SkippedRow task={task} onRestore={handleUndo} />
                      </React.Fragment>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}
          </>
        )}

        <SecondaryButton label="Add care task" icon={Plus} onPress={() => openSheet(null)} />
      </ScrollView>

      <BottomSheetModal
        ref={sheetRef}
        enableDynamicSizing
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.sheetHandle}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
      >
        <AddTaskSheetScrollable
          key={preset?.key ?? 'blank'}
          initialTemplate={preset}
          onClose={() => sheetRef.current?.close()}
        />
      </BottomSheetModal>
    </>,
  );
}

/** First-load skeleton (spec §62) — hero block + daypart groups. */
function TodaySkeleton() {
  return (
    <View style={styles.skeletonWrap}>
      <Skeleton height={160} style={styles.skeletonHero} />
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.skeletonGroup}>
          <Skeleton width={96} height={18} />
          <View style={styles.skeletonCard}>
            <Skeleton width="72%" height={16} />
            <Skeleton width="44%" height={13} />
            <View style={styles.skeletonDivider} />
            <Skeleton width="58%" height={16} />
            <Skeleton width="38%" height={13} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: {
    paddingHorizontal: spacing.s16,
    paddingTop: spacing.s8,
    gap: spacing.s24,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.s16,
  },
  emptyBlock: { gap: spacing.s8 },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.s8,
    paddingHorizontal: spacing.s16,
  },
  group: { gap: 0 },
  groupCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: spacing.s16,
  },
  skippedToggle: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
  },
  skippedToggleLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  sheetBackground: { backgroundColor: colors.surface, borderRadius: radius.cardLg },
  sheetHandle: { backgroundColor: colors.border },
  skeletonWrap: { gap: spacing.s24, paddingTop: spacing.s8 },
  skeletonHero: { borderRadius: radius.hero },
  skeletonGroup: { gap: spacing.s12 },
  skeletonCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.s16,
    gap: spacing.s8,
  },
  skeletonDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.s4,
  },
});
