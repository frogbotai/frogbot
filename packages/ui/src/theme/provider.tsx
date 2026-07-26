'use client'

import type { CSSProperties, ReactNode } from 'react'
import { createContext, useContext, useLayoutEffect, useState, useSyncExternalStore } from 'react'

import type { BrandTheme } from './brand'

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedThemeMode = Exclude<ThemeMode, 'system'>
export type ThemeTokens = Record<`--${string}`, string>

export interface ThemeStorage {
  get: (key: string) => ThemeMode | null
  set: (key: string, mode: ThemeMode) => void | Promise<void>
}

export interface ThemeProviderProps {
  brand?: BrandTheme
  children: ReactNode
  mode?: ThemeMode
  onModeChange?: (mode: ThemeMode) => void
  storage?: ThemeStorage
  storageKey?: string
  theme?: ThemeTokens
}

interface ThemeContextValue {
  mode: ThemeMode
  resolvedMode: ResolvedThemeMode
  setMode: (mode: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)
const mediaQuery = '(prefers-color-scheme: dark)'

const browserStorage: ThemeStorage = {
  get: (key) => {
    const value = localStorage.getItem(key)
    return value === 'light' || value === 'dark' || value === 'system' ? value : null
  },
  set: (key, mode) => localStorage.setItem(key, mode),
}

function subscribeSystemMode(callback: () => void) {
  const query = window.matchMedia(mediaQuery)
  query.addEventListener('change', callback)
  return () => query.removeEventListener('change', callback)
}

function getSystemMode(): ResolvedThemeMode {
  return window.matchMedia(mediaQuery).matches ? 'dark' : 'light'
}

export function ThemeProvider({
  children,
  brand,
  mode: controlledMode,
  onModeChange,
  storage,
  storageKey = 'fb-ui-theme',
  theme,
}: ThemeProviderProps) {
  const systemMode = useSyncExternalStore<ResolvedThemeMode>(subscribeSystemMode, getSystemMode, () => 'light')
  const [internalMode, setInternalMode] = useState<ThemeMode>(controlledMode ?? 'system')
  const mode = controlledMode ?? internalMode
  const resolvedMode = mode === 'system' ? systemMode : mode

  useLayoutEffect(() => {
    if (controlledMode) {
      document.documentElement.dataset.fbTheme = controlledMode
      return
    }
    const storedMode = (storage ?? browserStorage).get(storageKey)
    if (storedMode) {
      document.documentElement.dataset.fbTheme = storedMode
      setInternalMode(storedMode)
    }
  }, [controlledMode, storage, storageKey])

  const setMode = (nextMode: ThemeMode) => {
    if (!controlledMode) setInternalMode(nextMode)
    document.documentElement.dataset.fbTheme = nextMode
    onModeChange?.(nextMode)
    void (storage ?? browserStorage).set(storageKey, nextMode)
  }

  return (
    <ThemeContext.Provider value={{ mode, resolvedMode, setMode }}>
      <div
        className={mode === 'dark' ? 'dark' : undefined}
        data-fb-ui=""
        data-theme={mode}
        style={{ ...brand?.tokens, ...theme } as CSSProperties}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  )
}

export function ThemeScript({ nonce, storageKey = 'fb-ui-theme' }: { nonce?: string; storageKey?: string }) {
  const script = `try{var m=localStorage.getItem(${JSON.stringify(storageKey)});if(m==='light'||m==='dark'||m==='system')document.documentElement.dataset.fbTheme=m}catch(e){}`
  return <script dangerouslySetInnerHTML={{ __html: script }} nonce={nonce} />
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}
