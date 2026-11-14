'use client';

import { createContext, useContext } from 'react';

/** What a component in the sidebar's slots needs to look and behave like a built-in item. */
export type SidebarState = {
  /** Closes the phone drawer; does nothing on desktop. */
  closeDrawer: () => void;
  /** Whether labels show; they follow `open` after the open animation. */
  labelsVisible: boolean;
  /** Whether the sidebar is open, as opposed to the collapsed rail. */
  open: boolean;
};

const noop = () => {};

export const SidebarDrawerContext = createContext<() => void>(noop);

export const SidebarOpenContext = createContext<Omit<SidebarState, 'closeDrawer'>>({
  labelsVisible: true,
  open: true,
});

/** The sidebar's state, for a component rendered in one of its slots such as `beforeNavLinks`. */
export function useSidebarState(): SidebarState {
  return { ...useContext(SidebarOpenContext), closeDrawer: useContext(SidebarDrawerContext) };
}
