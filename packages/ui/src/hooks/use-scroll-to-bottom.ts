'use client'

import { useEffect, useRef } from 'react'

export function useScrollToBottom<T>(dependency: T) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => ref.current?.scrollIntoView({ block: 'end' }), [dependency])
  return ref
}
