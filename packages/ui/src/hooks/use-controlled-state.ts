'use client'

import { useState } from 'react'

export function useControlledState<T>({
  defaultValue,
  onChange,
  value,
}: {
  defaultValue: T
  onChange?: (value: T) => void
  value?: T
}) {
  const [internalValue, setInternalValue] = useState(defaultValue)
  const resolvedValue = value ?? internalValue
  const setValue = (nextValue: T | ((value: T) => T)) => {
    const next = typeof nextValue === 'function' ? (nextValue as (value: T) => T)(resolvedValue) : nextValue
    if (value === undefined) setInternalValue(next)
    onChange?.(next)
  }
  return [resolvedValue, setValue] as const
}
