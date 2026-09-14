import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

let reducedMotion = false;
let initialized = false;
let systemSubscription: { remove: () => void } | null = null;
const subscribers = new Set<() => void>();

function initializeReducedMotion() {
  if (initialized) return;
  initialized = true;
  void AccessibilityInfo.isReduceMotionEnabled()
    .then((value) => {
      if (reducedMotion === value) return;
      reducedMotion = value;
      subscribers.forEach((listener) => listener());
    })
    .catch(() => undefined);
  systemSubscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
    if (reducedMotion === value) return;
    reducedMotion = value;
    subscribers.forEach((listener) => listener());
  });
}

function subscribeReducedMotion(listener: () => void) {
  initializeReducedMotion();
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
    if (subscribers.size === 0) {
      systemSubscription?.remove();
      systemSubscription = null;
      initialized = false;
    }
  };
}

function reducedMotionSnapshot() {
  initializeReducedMotion();
  return reducedMotion;
}

/** Shared system preference subscription for all animated surfaces. */
export function useReducedMotion() {
  return useSyncExternalStore(subscribeReducedMotion, reducedMotionSnapshot, () => false);
}

/** Android blur is weaker; shorten enter animations on low-end feel. */
export function prefersSnappyMotion() {
  return Platform.OS === 'android';
}

export function enterDuration(baseMs: number) {
  return prefersSnappyMotion() ? Math.round(baseMs * 0.85) : baseMs;
}

export function shouldStaggerListEnter(index: number) {
  return index < (prefersSnappyMotion() ? 5 : 6);
}
