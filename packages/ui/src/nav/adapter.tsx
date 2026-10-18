'use client';

import {
  type AnchorHTMLAttributes,
  type ComponentType,
  createContext,
  type ReactNode,
  type Ref,
  use,
  useMemo,
  useSyncExternalStore,
} from 'react';

export type NavLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

/** Where the nav keeps small per-user settings, such as a collapsed section. */
export type NavPreferences = {
  get: <Value>(key: string) => Promise<Value | null | undefined>;
  set: <Value>(key: string, value: Value) => Promise<void> | void;
};

/** The open state the host shares with its own layout, such as an admin template. */
export type NavDrawer = {
  open: boolean;
  setOpen: (open: boolean) => void;
  hydrated: boolean;
  ref?: Ref<HTMLDivElement>;
};

/** What the nav needs from its host: links, the current path, navigation and preferences. */
export type NavAdapter = {
  Link: ComponentType<NavLinkProps>;
  pathname: string;
  navigate: (path: string) => void;
  preferences: NavPreferences;
  drawer?: NavDrawer;
};

function AnchorLink({ children, ...props }: NavLinkProps) {
  return <a {...props}>{children}</a>;
}

const subscribeToLocation = (callback: () => void) => {
  window.addEventListener('popstate', callback);

  return () => window.removeEventListener('popstate', callback);
};

const memory = new Map<string, unknown>();

const memoryPreferences: NavPreferences = {
  get: <Value,>(key: string) => Promise.resolve(memory.get(key) as Value | undefined),
  set: (key, value) => {
    memory.set(key, value);
  },
};

const NavAdapterContext = createContext<Partial<NavAdapter> | undefined>(undefined);

function useDefaultPathname() {
  return useSyncExternalStore(
    subscribeToLocation,
    () => window.location.pathname,
    () => '',
  );
}

/** Supplies the nav's host pieces. Anything left out uses an anchor, `location` and memory. */
export function NavAdapterProvider({
  children,
  ...adapter
}: Partial<NavAdapter> & { children: ReactNode }) {
  return <NavAdapterContext value={adapter}>{children}</NavAdapterContext>;
}

/** The nav's host pieces, with the defaults filled in. */
export function useNavAdapter(): NavAdapter {
  const adapter = use(NavAdapterContext);
  const pathname = useDefaultPathname();

  return useMemo(
    () => ({
      Link: adapter?.Link ?? AnchorLink,
      pathname: adapter?.pathname ?? pathname,
      navigate: adapter?.navigate ?? ((path: string) => window.location.assign(path)),
      preferences: adapter?.preferences ?? memoryPreferences,
      drawer: adapter?.drawer,
    }),
    [adapter, pathname],
  );
}
