'use client';

import { useSyncExternalStore } from 'react';

import type { CommentsTarget } from '../shared.js';

const pinned = new Map<string, number>();
const listeners = new Set<() => void>();
const posted = new Map<string, Set<() => void>>();
const postCounts = new Map<string, number>();
const seenCounts = new Map<string, number>();

/** The key the pinned box and the list of one record share. */
export function pinnedKey(target: Pick<CommentsTarget, 'collection' | 'documentId'>): string {
  return `${target.collection}:${String(target.documentId)}`;
}

function emit() {
  for (const listener of listeners) listener();
}

/** Marks a record's box as pinned in the panel footer until the returned function runs. */
export function registerPinned(key: string): () => void {
  pinned.set(key, (pinned.get(key) ?? 0) + 1);
  emit();

  return () => {
    const count = (pinned.get(key) ?? 1) - 1;

    if (count) pinned.set(key, count);
    else pinned.delete(key);
    emit();
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/** Whether a pinned box is showing for the record, so its list leaves out its own box. */
export function usePinnedBox(key: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => pinned.has(key),
    () => false,
  );
}

/** Tells the record's list that the pinned box posted a comment. */
export function announcePosted(key: string): void {
  postCounts.set(key, (postCounts.get(key) ?? 0) + 1);

  for (const listener of posted.get(key) ?? []) listener();
}

/** Calls `listener` each time the record's pinned box posts a comment. */
export function onPosted(key: string, listener: () => void): () => void {
  const set = posted.get(key) ?? new Set();

  set.add(listener);
  posted.set(key, set);

  return () => {
    set.delete(listener);
    if (!set.size) posted.delete(key);
  };
}

/**
 * Whether the record's pinned box posted a comment that no list has loaded yet, as when the
 * list's tab was closed at the time. Marks it seen, so the caller reloads once.
 */
export function takeUnseenPost(key: string): boolean {
  const count = postCounts.get(key) ?? 0;
  const unseen = count > (seenCounts.get(key) ?? 0);

  seenCounts.set(key, count);

  return unseen;
}
