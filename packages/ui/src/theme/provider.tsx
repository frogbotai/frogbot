'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useLayoutEffect, useState, useSyncExternalStore } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

export type ResolvedThemeMode = Exclude<ThemeMode, 'system'>;

export interface ThemeStorage {
  get: (key: string) => ThemeMode | null;
  set: (key: string, mode: ThemeMode) => void | Promise<void>;
}

export interface ThemeProviderProps {
  children: ReactNode;
  mode?: ThemeMode;
  onModeChange?: (mode: ThemeMode) => void;
  storage?: ThemeStorage;
  storageKey?: string;
}

interface ThemeContextValue {
  mode: ThemeMode;
  resolvedMode: ResolvedThemeMode;
  section: boolean;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const mediaQuery = '(prefers-color-scheme: dark)';

const browserStorage: ThemeStorage = {
  get: (key) => {
    const value = localStorage.getItem(key);

    return value === 'light' || value === 'dark' || value === 'system' ? value : null;
  },
  set: (key, mode) => localStorage.setItem(key, mode),
};

function subscribeSystemMode(callback: () => void) {
  const query = window.matchMedia(mediaQuery);
  query.addEventListener('change', callback);

  return () => query.removeEventListener('change', callback);
}

function getSystemMode(): ResolvedThemeMode {
  return window.matchMedia(mediaQuery).matches ? 'dark' : 'light';
}

function applyPageMode(mode: ResolvedThemeMode) {
  document.documentElement.dataset.theme = mode;
}

/**
 * Without `mode`, the provider themes the page: it sets `data-theme` on `<html>`, the attribute the
 * admin panel's color tokens switch on. With `mode`, it themes only its own section and overlays.
 */
export function ThemeProvider({
  children,
  mode: controlledMode,
  onModeChange,
  storage,
  storageKey = 'fb-ui-theme',
}: ThemeProviderProps) {
  const systemMode = useSyncExternalStore<ResolvedThemeMode>(
    subscribeSystemMode,
    getSystemMode,
    () => 'light',
  );

  const [internalMode, setInternalMode] = useState<ThemeMode>('system');
  const mode = controlledMode ?? internalMode;
  const resolvedMode = mode === 'system' ? systemMode : mode;

  useLayoutEffect(() => {
    if (controlledMode) return;

    const storedMode = (storage ?? browserStorage).get(storageKey);
    if (storedMode) setInternalMode(storedMode);
  }, [controlledMode, storage, storageKey]);

  useLayoutEffect(() => {
    if (!controlledMode) applyPageMode(resolvedMode);
  }, [controlledMode, resolvedMode]);

  const setMode = (nextMode: ThemeMode) => {
    if (!controlledMode) setInternalMode(nextMode);
    onModeChange?.(nextMode);
    void (storage ?? browserStorage).set(storageKey, nextMode);
  };

  return (
    <ThemeContext.Provider
      value={{ mode, resolvedMode, section: Boolean(controlledMode), setMode }}
    >
      <div
        className="fb-theme"
        data-fb-ui=""
        data-theme={controlledMode ? resolvedMode : undefined}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

/** Sets `data-theme` on `<html>` from the stored or system mode before the page paints. */
export function ThemeScript({
  nonce,
  storageKey = 'fb-ui-theme',
}: {
  nonce?: string;
  storageKey?: string;
}) {
  const script = `try{var m=localStorage.getItem(${JSON.stringify(storageKey)});if(m!=='light'&&m!=='dark')m=matchMedia(${JSON.stringify(mediaQuery)}).matches?'dark':'light';document.documentElement.dataset.theme=m}catch(e){}`;

  return <script dangerouslySetInnerHTML={{ __html: script }} nonce={nonce} />;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');

  const { mode, resolvedMode, setMode } = context;

  return { mode, resolvedMode, setMode };
}

export function PortalTheme({ children }: { children: ReactNode }) {
  const context = useContext(ThemeContext);

  return (
    <div
      className="fb-portal"
      data-fb-ui=""
      data-theme={context?.section ? context.resolvedMode : undefined}
    >
      {children}
    </div>
  );
}
