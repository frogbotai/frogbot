'use client'

import { type FormEvent, type KeyboardEvent, type ReactNode, type TextareaHTMLAttributes,useLayoutEffect, useRef, useState } from 'react'

import { cn } from '../lib/utils'

export type ComposerProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onSubmit' | 'value' | 'defaultValue'> & {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  onSubmit: (value: string) => void | Promise<void>
  onStop?: () => void
  pending?: boolean
  startSlot?: ReactNode
  endSlot?: ReactNode
  submitContent: ReactNode
  stopContent: ReactNode
}

export function Composer({ className, defaultValue = '', disabled, endSlot, onKeyDown, onStop, onSubmit, onValueChange, pending = false, startSlot, stopContent, submitContent, value, ...props }: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [internalValue, setInternalValue] = useState(defaultValue)
  const currentValue = value ?? internalValue

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = '0px'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [currentValue])

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    const next = value ?? internalValue
    if (!next.trim() || pending || disabled) return
    void onSubmit(next)
    if (value === undefined) setInternalValue('')
    onValueChange?.('')
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(event)
    if (event.defaultPrevented || event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    submit()
  }

  return <form className={cn('flex items-end gap-2 rounded-xl border border-input bg-background p-2', className)} onSubmit={submit}>
    {startSlot}
    <textarea {...props} ref={textareaRef} disabled={disabled} rows={1} value={currentValue} onChange={(event) => {
      if (value === undefined) setInternalValue(event.target.value)
      onValueChange?.(event.target.value)
    }} onKeyDown={handleKeyDown} className="max-h-48 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 outline-none" />
    {endSlot}
    {pending
      ? <button type="button" onClick={onStop} className="shrink-0 rounded-lg bg-destructive px-3 py-2 text-destructive-foreground">{stopContent}</button>
      : <button type="submit" disabled={disabled || !currentValue.trim()} className="shrink-0 rounded-lg bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50">{submitContent}</button>}
  </form>
}
