'use client';

import { useId, useLayoutEffect, useSyncExternalStore } from 'react';

type SidebarLink = { exact: boolean; path: string };

const links = new Map<string, SidebarLink>();
const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

const trimPath = (value: string) => {
  const path = value.split(/[?#]/)[0] ?? '';

  return path.length > 1 ? path.replace(/\/+$/, '') : path;
};

/** True when the current page is `path` or, unless `exact`, a page under it. */
export function containsPage(currentPath: string, path: string, exact = false): boolean {
  const current = trimPath(currentPath);
  const target = trimPath(path);

  if (current === target) return true;

  return !exact && target !== '/' && current.startsWith(`${target}/`);
}

function activeLinkId(currentPath: string): string | null {
  let best: { id: string; length: number } | undefined;

  for (const [id, link] of links) {
    if (!containsPage(currentPath, link.path, link.exact)) continue;

    const length = trimPath(link.path).length;

    if (!best || length > best.length) best = { id, length };
  }

  return best?.id ?? null;
}

export type ActiveLinkOptions = {
  /** Match only the page itself, as for the home link. */
  exact?: boolean;
  /** Leave the link out of the choice, e.g. when its caller sets `active` itself. */
  skip?: boolean;
};

/**
 * Whether this sidebar link is the one to highlight: of all mounted links whose page contains
 * the current page, the most specific wins, and the first one rendered breaks a tie.
 */
export function useActiveLink(
  path: string,
  currentPath: string,
  { exact = false, skip = false }: ActiveLinkOptions = {},
): boolean {
  const id = useId();

  useLayoutEffect(() => {
    if (skip) return;

    links.set(id, { exact, path });
    notify();

    return () => {
      links.delete(id);
      notify();
    };
  }, [exact, id, path, skip]);

  const activeId = useSyncExternalStore(
    subscribe,
    () => activeLinkId(currentPath),
    () => null,
  );

  if (skip) return false;

  return activeId === null ? containsPage(currentPath, path, exact) : activeId === id;
}
