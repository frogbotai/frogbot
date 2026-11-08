'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverZone = () => null;

/** The browser's time zone, or `null` on the server and during hydration. */
export function useBrowserTimeZone(): string | null {
  return useSyncExternalStore(subscribe, browserZone, serverZone);
}
