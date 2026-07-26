'use client'

import { useEffect, useRef } from 'react'

export function useHotkey(key: string, callback: () => void, options: { meta?: boolean; shift?: boolean } = {}) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() === key.toLowerCase() &&
        (options.meta === undefined || (event.metaKey || event.ctrlKey) === options.meta) &&
        (options.shift === undefined || event.shiftKey === options.shift)
      ) {
        event.preventDefault()
        callbackRef.current()
      }
    }
    document.addEventListener('keydown', listener)
    return () => document.removeEventListener('keydown', listener)
  }, [key, options.meta, options.shift])
}
