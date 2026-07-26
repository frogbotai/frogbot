'use client'

import { useState } from 'react'

export function useControlledState<T>({
  controlled,
  defaultValue,
  onChange,
  value,
}: {
  controlled?: boolean
  defaultValue: T
  onChange?: (value: T) => void
  value?: T
}) {
  const [internalValue, setInternalValue] = useState(defaultValue)
  const isControlled = controlled ?? value !== undefined
  const resolvedValue = isControlled ? value as T : internalValue
  const setValue = (nextValue: T | ((value: T) => T)) => {
    const next = typeof nextValue === 'function' ? (nextValue as (value: T) => T)(resolvedValue) : nextValue
    if (!isControlled) setInternalValue(next)
    onChange?.(next)
  }
  return [resolvedValue, setValue] as const
}
