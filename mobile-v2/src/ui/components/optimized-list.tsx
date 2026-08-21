import React from 'react';
import { FlashList, type FlashListProps } from '@shopify/flash-list';

/** Shared long-list entry point. Keep list tuning in one place as feature row metrics become known. */
export function OptimizedList<T>(props: FlashListProps<T>) {
  return <FlashList {...props} />;
}
