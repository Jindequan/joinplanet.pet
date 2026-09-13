import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import type { NotificationResponse } from 'expo-notifications';
import {
  clearSessionToken,
  clearSessionUserId,
  readSessionToken,
  readSessionUserId,
  writeSessionToken,
  writeSessionUserId,
} from '../storage/secure-storage';
import { createIdempotencyKey, planetApi } from '../api/planet-api';
import {
  enqueueCareAction,
  shouldRetryCareAction,
  subscribeCareActionQueue,
  syncCareActionQueue,
  waitForCareActionQueue,
} from '../storage/care-action-queue';
import {
  subscribePendingCareTasks,
  syncPendingCareTaskQueue,
  waitForPendingCareTaskQueue,
} from '../foundation/pending-today';
import {
  subscribePendingTimelineEvents,
  syncPendingTimelineEvents,
} from '../storage/timeline-event-queue';
import { ApiError, setUnauthorizedHandler } from '../network/api-client';
import { queryClient } from '../query/query-client';
import { invalidateAfterRemoteCareLiveSync } from '../foundation/cache';
import { subscribeCareLiveSync } from '../collaboration/live-sync';
import {
  CARE_NOTIFICATION_ACTION,
  CARE_NOTIFICATION_CATEGORY,
  careNotificationAction,
  careNotificationRoute,
  type CareNotificationData,
} from '../notifications/contract';
import { CARE_ACTION_LABELS } from '../presentation/terminology';

type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';
export type PushRegistrationStatus = 'unsupported' | 'idle' | 'requesting' | 'ready' | 'denied' | 'not_configured' | 'failed';

type SessionContextValue = {
  status: SessionStatus;
  token: string | null;
  userId: string | null;
  pushStatus: PushRegistrationStatus;
  signIn: (token: string, userId?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshPushRegistration: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);
const MAX_HANDLED_NOTIFICATION_RESPONSES = 256;

async function clearPendingNotificationResponse(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const Notifications = await import('expo-notifications');
    await Notifications.clearLastNotificationResponseAsync();
  } catch {
    // Response cleanup is a session-boundary safeguard, not a reason to block
    // logout or authentication.
  }
}

export function SessionProvider({ children }: React.PropsWithChildren) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<PushRegistrationStatus>(
    Platform.OS === 'web' ? 'unsupported' : 'idle',
  );
  const [pushRegistrationAttempt, setPushRegistrationAttempt] = useState(0);
  const userIdRef = useRef<string | null>(null);
  const pushTokenRef = useRef<string | null>(null);
  const pushRegistrationRef = useRef<Promise<void> | null>(null);
  const signingOutRef = useRef(false);
  const handledNotificationResponses = useRef(new Set<string>());

  useEffect(() => {
    setUnauthorizedHandler(() => {
      const tokenToDelete = pushTokenRef.current;
      if (tokenToDelete) {
        // A 401 is also a session boundary. Best-effort cleanup prevents a
        // device from continuing to receive the expired account's alerts.
        void planetApi.notifications.deletePushToken(tokenToDelete).catch(() => undefined);
        pushTokenRef.current = null;
        setPushToken(null);
      }
      void clearSessionToken();
      void clearSessionUserId();
      void clearPendingNotificationResponse();
      userIdRef.current = null;
      setUserId(null);
      queryClient.clear();
      setToken(null);
      setStatus('unauthenticated');
    });
    return () => setUnauthorizedHandler();
  }, []);

  // A family member may be using the same account in another browser tab.
  // Refresh the shared responsibility surfaces immediately there; polling
  // and native push continue to cover separate devices and suspended tabs.
  useEffect(() => {
    if (status !== 'authenticated') return;
    return subscribeCareLiveSync((event) => {
      invalidateAfterRemoteCareLiveSync(queryClient, event);
    });
  }, [status]);

  // Replay belongs to the authenticated shell, not to one inbox screen.
  // Notification actions can land directly on a batch detail route; they
  // must still replay after cold start, foreground, or a transient 5xx.
  useEffect(() => {
    if (status !== 'authenticated' || !userId) return;
    let mounted = true;
    let running = false;
    const sync = async () => {
      if (!mounted || running || signingOutRef.current) return;
      running = true;
      try {
        await syncCareActionQueue(queryClient, userId);
      } catch {
        // The durable queue remains authoritative; the next foreground or
        // interval run retries without blocking authentication/navigation.
      }
      if (!mounted || signingOutRef.current) {
        running = false;
        return;
      }
      try {
        await syncPendingCareTaskQueue(queryClient, userId);
      } catch {
        // Completion/skip uses the same durable retry contract as handoffs.
      } finally {
        try {
          await syncPendingTimelineEvents(queryClient, userId);
        } catch {
          // Timeline facts remain durable and will retry on the next
          // foreground/interval; they must never block authentication.
        } finally {
          running = false;
        }
      }
    };
    const unsubscribeCare = subscribeCareActionQueue(() => void sync());
    const unsubscribeToday = subscribePendingCareTasks(() => void sync());
    const unsubscribeTimeline = subscribePendingTimelineEvents(() => void sync());
    const appStateSubscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void sync();
    });
    const retryTimer = setInterval(() => void sync(), 15_000);
    void sync();
    return () => {
      mounted = false;
      unsubscribeCare();
      unsubscribeToday();
      unsubscribeTimeline();
      appStateSubscription.remove();
      clearInterval(retryTimer);
    };
  }, [status, userId]);

  // Register categories before authentication. A first-time recipient must
  // still receive a real, actionable care card; waiting for sign-in would
  // make the first push a passive reminder with no responsibility controls.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let mounted = true;
    void import('expo-notifications').then(async (Notifications) => {
      if (!mounted) return;
      try {
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
          }),
        });
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('care_coordination', {
            name: '家庭照护',
            description: '家庭成员之间的照护请求、回应和完成记录',
            importance: Notifications.AndroidImportance.HIGH,
            sound: 'default',
            vibrationPattern: [0, 250, 150, 250],
            enableVibrate: true,
            showBadge: true,
          });
        }
        await Notifications.setNotificationCategoryAsync(CARE_NOTIFICATION_CATEGORY.request, [
          {
            identifier: CARE_NOTIFICATION_ACTION.request.accept,
            buttonTitle: CARE_ACTION_LABELS.accept,
            options: { opensAppToForeground: true },
          },
          {
            identifier: CARE_NOTIFICATION_ACTION.request.decline,
            buttonTitle: CARE_ACTION_LABELS.decline,
            options: { opensAppToForeground: true, isDestructive: true },
          },
          {
            identifier: CARE_NOTIFICATION_ACTION.request.delegate,
            buttonTitle: CARE_ACTION_LABELS.delegate,
            options: { opensAppToForeground: true },
          },
        ]);
        await Notifications.setNotificationCategoryAsync(CARE_NOTIFICATION_CATEGORY.batch, [
          {
            identifier: CARE_NOTIFICATION_ACTION.batch.accept,
            buttonTitle: CARE_ACTION_LABELS.accept,
            options: { opensAppToForeground: true },
          },
          {
            identifier: CARE_NOTIFICATION_ACTION.batch.decline,
            buttonTitle: CARE_ACTION_LABELS.decline,
            options: { opensAppToForeground: true, isDestructive: true },
          },
          {
            identifier: CARE_NOTIFICATION_ACTION.batch.delegate,
            buttonTitle: CARE_ACTION_LABELS.delegate,
            options: { opensAppToForeground: true },
          },
        ]);
      } catch {
        // A platform without notification categories still gets the inbox/deep-link flow.
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      setPushStatus('unsupported');
      return;
    }
    if (status !== 'authenticated') {
      setPushStatus('idle');
      return;
    }
    let mounted = true;
    const registrationUserId = userId;
    setPushStatus('requesting');
    const registration = (async () => {
      try {
        const Notifications = await import('expo-notifications');
        // EAS exposes the id through either the dynamic config or the native
        // Constants manifest depending on the build path. Local Simulator
        // builds may omit it, but still request system permission so local
        // notification UI can be exercised; only a configured build may
        // register a remote Expo token.
        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
        if (!projectId && !__DEV__) {
          if (mounted) setPushStatus('not_configured');
          return;
        }
        const current = await Notifications.getPermissionsAsync();
        const permission =
          current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
            ? current
            : await Notifications.requestPermissionsAsync();
        if (
          !permission.granted &&
          permission.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL
        ) {
          if (mounted) setPushStatus('denied');
          return;
        }
        if (!projectId) {
          if (mounted) setPushStatus('not_configured');
          return;
        }
        const result = await Notifications.getExpoPushTokenAsync(
          { projectId },
        );
        if (
          !mounted ||
          signingOutRef.current ||
          userIdRef.current !== registrationUserId
        ) {
          // The account may have changed while the native token was being
          // resolved. Never leave that token attached to the old session.
          await planetApi.notifications.deletePushToken(result.data).catch(() => undefined);
          return;
        }
        await planetApi.notifications.registerPushToken(result.data, Platform.OS);
        if (
          !mounted ||
          signingOutRef.current ||
          userIdRef.current !== registrationUserId
        ) {
          await planetApi.notifications.deletePushToken(result.data).catch(() => undefined);
          return;
        }
        pushTokenRef.current = result.data;
        setPushToken(result.data);
        setPushStatus('ready');
      } catch {
        // Push must never block sign-in.
        if (mounted) setPushStatus('failed');
      }
    })();
    pushRegistrationRef.current = registration;
    void registration.finally(() => {
      if (pushRegistrationRef.current === registration) pushRegistrationRef.current = null;
    });
    return () => {
      mounted = false;
    };
  }, [pushRegistrationAttempt, status, userId]);

  useEffect(() => {
    if (status !== 'authenticated' || Platform.OS === 'web') return;
    let mounted = true;
    let responseSubscription: { remove: () => void } | undefined;
    let receivedSubscription: { remove: () => void } | undefined;

    void import('expo-notifications').then(async (Notifications) => {
      if (!mounted) return;
      const invalidateForNotification = (data: CareNotificationData | undefined) => {
        if (data?.kind === CARE_NOTIFICATION_CATEGORY.request || data?.kind === 'care_handoff' || data?.kind === CARE_NOTIFICATION_CATEGORY.batch || data?.kind === 'care_handoff_batch_status') {
          void queryClient.invalidateQueries({ queryKey: ['care-requests', 'inbox'] });
          void queryClient.invalidateQueries({ queryKey: ['care-requests', 'sent'] });
          void queryClient.invalidateQueries({ queryKey: ['care-handoff-batches', 'inbox'] });
          void queryClient.invalidateQueries({ queryKey: ['today'] });
        }
        if (
          data?.kind === 'care_completed' ||
          data?.kind === 'care_reminder' ||
          data?.kind === 'care_digest' ||
          data?.kind === 'care_alert'
        ) {
          void queryClient.invalidateQueries({ queryKey: ['today'] });
        }
        if (data?.care_request_id) {
          void queryClient.invalidateQueries({ queryKey: ['care-requests', 'request', data.care_request_id] });
          void queryClient.invalidateQueries({ queryKey: ['care-requests', 'chain', data.care_request_id] });
        }
      };
      const openCareRequest = async (response: NotificationResponse | null) => {
        const data = response?.notification.request.content.data as CareNotificationData | undefined;
        if (response) {
          // iOS can deliver the same action through the live listener and
          // again through getLastNotificationResponseAsync during cold start.
          const responseKey = [
            response.notification.request.identifier,
            data?.care_request_id ?? data?.kind ?? '',
            response.actionIdentifier,
          ].join(':');
          if (handledNotificationResponses.current.has(responseKey)) return;
          if (handledNotificationResponses.current.size >= MAX_HANDLED_NOTIFICATION_RESPONSES) {
            const oldest = handledNotificationResponses.current.values().next().value;
            if (oldest) handledNotificationResponses.current.delete(oldest);
          }
          handledNotificationResponses.current.add(responseKey);
        }
        if (response && response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
          void Notifications.dismissNotificationAsync(response.notification.request.identifier).catch(() => undefined)
        }
        const notificationAction = careNotificationAction(response?.actionIdentifier)
        invalidateForNotification(data);
        // A notification must resolve to one canonical task/request surface.
        // Replace the current route so repeated taps cannot build a stack of
        // duplicate Today or request screens.
        const navigateToNotificationRoute = (route: ReturnType<typeof careNotificationRoute>) => {
          if (!route) return;
          if (route.surface === 'today') {
            const params = {
              ...(route.occurrenceId ? { focus_task_id: route.occurrenceId } : {}),
              ...(route.familyId ? { family_id: route.familyId } : {}),
              ...(route.petId ? { pet_id: route.petId } : {}),
            }
            router.replace({
              pathname: '/(tabs)',
              params: Object.keys(params).length > 0 ? params : undefined,
            } as never);
            return;
          }
          if (route.surface === 'request') {
            router.replace({
              pathname: `/requests/${route.requestId}`,
              params: route.careAction ? { care_action: route.careAction } : undefined,
            } as never);
            return;
          }
          router.replace({
            pathname: `/handoffs/${route.batchId}`,
            params: route.careAction ? { care_batch_action: route.careAction } : undefined,
          } as never);
        };
        if (data?.kind === CARE_NOTIFICATION_CATEGORY.request && data.care_request_id) {
          if (notificationAction === 'accept') {
            const commandId = createIdempotencyKey();
            const actionUserId = userIdRef.current ?? await readSessionUserId();
            try {
              await planetApi.careRequests.accept(data.care_request_id, '', commandId);
            } catch (error) {
              if (actionUserId && shouldRetryCareAction(error)) {
                try {
                  await enqueueCareAction({
                    userId: actionUserId,
                    commandId,
                    kind: 'accept',
                    requestId: data.care_request_id,
                    occurrenceId: data.occurrence_id,
                    note: '',
                  });
                } catch {
                  // The request detail remains the authoritative retry surface
                  // when device storage itself is unavailable.
                }
              }
              // The inbox remains authoritative when the request is stale or already handled.
            }
            invalidateForNotification(data);
            void queryClient.invalidateQueries({ queryKey: ['today'] });
            navigateToNotificationRoute(careNotificationRoute(data, notificationAction));
            return;
          }
          if (notificationAction === 'decline') {
            const commandId = createIdempotencyKey();
            const actionUserId = userIdRef.current ?? await readSessionUserId();
            try {
              await planetApi.careRequests.decline(data.care_request_id, '', commandId);
            } catch (error) {
              if (actionUserId && shouldRetryCareAction(error)) {
                try {
                  await enqueueCareAction({
                    userId: actionUserId,
                    commandId,
                    kind: 'decline',
                    requestId: data.care_request_id,
                    occurrenceId: data.occurrence_id,
                    note: '',
                    followUp: 'reassign',
                  });
                } catch {
                  // The request detail remains the authoritative retry surface
                  // when device storage itself is unavailable.
                }
              }
              // The inbox remains authoritative when the request is stale or already handled.
            }
            invalidateForNotification(data);
            navigateToNotificationRoute(careNotificationRoute(data, notificationAction));
            return;
          }
          if (notificationAction === 'delegate') {
            navigateToNotificationRoute(careNotificationRoute(data, notificationAction));
            return;
          }
          navigateToNotificationRoute(careNotificationRoute(data, notificationAction));
          return;
        }
        if (
          data?.kind === 'care_completed' ||
          data?.kind === 'care_handoff' ||
          data?.kind === 'care_reminder' ||
          data?.kind === 'care_digest' ||
          data?.kind === 'care_alert'
        ) {
          navigateToNotificationRoute(careNotificationRoute(data, notificationAction));
          return;
        }
        if ((data?.kind === CARE_NOTIFICATION_CATEGORY.batch || data?.kind === 'care_handoff_batch_status') && data.care_batch_id) {
          if (data.kind === CARE_NOTIFICATION_CATEGORY.batch && (notificationAction === 'accept' || notificationAction === 'decline')) {
            const commandId = createIdempotencyKey();
            const action = notificationAction;
            const actionUserId = userIdRef.current ?? await readSessionUserId();
            try {
              if (action === 'accept') {
                await planetApi.careHandoffBatches.accept(data.care_batch_id, [], commandId);
              } else {
                await planetApi.careHandoffBatches.decline(data.care_batch_id, [], commandId);
              }
            } catch (error) {
              if (actionUserId && shouldRetryCareAction(error)) {
                try {
                  await enqueueCareAction({
                    userId: actionUserId,
                    commandId,
                    kind: action === 'accept' ? 'batch-accept' : 'batch-decline',
                    batchId: data.care_batch_id,
                    ...(action === 'decline' ? { followUp: 'reassign' as const } : {}),
                  });
                } catch {
                  // The batch detail remains the authoritative retry surface
                  // when device storage itself is unavailable.
                }
              }
            }
            invalidateForNotification(data);
          }
          navigateToNotificationRoute(careNotificationRoute(data, notificationAction));
        }
      };
      const consumeNotificationResponse = async (response: NotificationResponse) => {
        try {
          await openCareRequest(response);
        } finally {
          // Expo keeps the last response across process restarts. Clear it
          // only if it is still the response we just consumed, so a newer
          // tap arriving while an API request is pending is never discarded.
          try {
            const last = await Notifications.getLastNotificationResponseAsync();
            const sameResponse =
              last?.notification.request.identifier === response.notification.request.identifier &&
              last.actionIdentifier === response.actionIdentifier;
            if (sameResponse) await Notifications.clearLastNotificationResponseAsync();
          } catch {
            // Clearing is a replay guard, not a reason to block the action.
          }
        }
      };
      receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
        invalidateForNotification(notification.request.content.data as CareNotificationData | undefined);
      });
      responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
        void consumeNotificationResponse(response);
      });
      const last = await Notifications.getLastNotificationResponseAsync();
      if (mounted && last) void consumeNotificationResponse(last);
    });

    return () => {
      mounted = false;
      receivedSubscription?.remove();
      responseSubscription?.remove();
    };
  }, [status]);

  useEffect(() => {
    let mounted = true;
    void Promise.all([readSessionToken(), readSessionUserId()]).then(([savedToken, savedUserId]) => {
      if (!mounted) return;
      if (!savedToken) {
        void clearSessionUserId();
        userIdRef.current = null;
        setUserId(null);
        setStatus('unauthenticated');
        return;
      }
      userIdRef.current = savedUserId;
      setUserId(savedUserId);
      void planetApi.me
        .get()
        .then((me) => {
          if (!mounted) return;
          userIdRef.current = me.user.id;
          setUserId(me.user.id);
          void writeSessionUserId(me.user.id).catch(() => undefined);
          setToken(savedToken);
          setStatus('authenticated');
        })
        .catch(async (error) => {
          if (!mounted) return;
          if (error instanceof ApiError && error.status === 401) {
            await clearSessionToken();
            await clearSessionUserId();
            userIdRef.current = null;
            setUserId(null);
            setToken(null);
            setStatus('unauthenticated');
            return;
          }
          setToken(savedToken);
          setStatus('authenticated');
        });
    });
    return () => {
      mounted = false;
    };
  }, []);

  const signIn = useCallback(async (nextToken: string, nextUserId?: string) => {
    signingOutRef.current = false;
    const previousUserId = userIdRef.current;
    if (previousUserId !== nextUserId) {
      // signIn is also used when a user changes account without first
      // visiting the sign-out screen. Finish the old registration, then
      // detach its device token before the new session becomes active.
      await pushRegistrationRef.current?.catch(() => undefined);
      const tokenToDelete = pushTokenRef.current ?? pushToken;
      if (tokenToDelete) {
        await planetApi.notifications.deletePushToken(tokenToDelete).catch(() => undefined);
      }
      await clearPendingNotificationResponse();
      pushTokenRef.current = null;
      setPushToken(null);
      setPushStatus(Platform.OS === 'web' ? 'unsupported' : 'idle');
    }
    await writeSessionToken(nextToken);
    queryClient.clear();
    userIdRef.current = nextUserId ?? null;
    setUserId(nextUserId ?? null);
    if (nextUserId) await writeSessionUserId(nextUserId);
    setToken(nextToken);
    setStatus('authenticated');
    void planetApi.me.get().then((me) => {
      userIdRef.current = me.user.id;
      setUserId(me.user.id);
      return writeSessionUserId(me.user.id);
    }).catch(() => undefined);
  }, [pushToken]);

  const signOut = useCallback(async () => {
    signingOutRef.current = true;
    const currentUserId = userIdRef.current ?? userId;
    if (currentUserId) {
      await Promise.all([
        waitForCareActionQueue(currentUserId),
        waitForPendingCareTaskQueue(currentUserId),
      ]);
    }
    // Do not let an in-flight registration complete after logout and attach
    // this device back to the account that just signed out.
    await pushRegistrationRef.current?.catch(() => undefined);
    const tokenToDelete = pushTokenRef.current ?? pushToken;
    if (tokenToDelete) {
      try {
        await planetApi.notifications.deletePushToken(tokenToDelete);
      } catch {
        /* local sign-out still wins */
      }
    }
    pushTokenRef.current = null;
    setPushToken(null);
    setPushStatus(Platform.OS === 'web' ? 'unsupported' : 'idle');
    try {
      await planetApi.auth.logout();
    } catch {
      /* local sign-out still wins */
    }
    await clearSessionToken();
    await clearSessionUserId();
    await clearPendingNotificationResponse();
    handledNotificationResponses.current.clear();
    userIdRef.current = null;
    setUserId(null);
    queryClient.clear();
    setToken(null);
    setStatus('unauthenticated');
    signingOutRef.current = false;
  }, [pushToken, userId]);

  const refreshPushRegistration = useCallback(() => {
    setPushRegistrationAttempt((attempt) => attempt + 1);
  }, []);

  const value = useMemo(
    () => ({ status, token, userId, pushStatus, signIn, signOut, refreshPushRegistration }),
    [pushStatus, refreshPushRegistration, signIn, signOut, status, token, userId],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider');
  return context;
}
