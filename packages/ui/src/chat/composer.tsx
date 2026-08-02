'use client'

import type { FrogBotSDK } from '@frogbotai/sdk'
import { ArrowUp, Square } from 'lucide-react'
import { type DragEvent, type FormEvent, type KeyboardEvent, type ReactNode, type TextareaHTMLAttributes,useLayoutEffect, useRef, useState } from 'react'

import { cn } from '../lib/utils'
import { AttachmentControl, AttachmentPreviews, type FileReference, useAttachments } from './attachments'

export type ComposerProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onSubmit' | 'value' | 'defaultValue'> & {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  onSubmit: (value: string, attachments: FileReference[]) => void | Promise<void>
  onStop?: () => void
  pending?: boolean
  startSlot?: ReactNode
  endSlot?: ReactNode
  submitContent: ReactNode
  stopContent: ReactNode
  sdk?: FrogBotSDK
  filesSlug?: string
}

export function Composer({ className, defaultValue = '', disabled, endSlot, filesSlug, onKeyDown, onStop, onSubmit, onValueChange, pending = false, sdk, startSlot, stopContent, submitContent, value, ...props }: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [internalValue, setInternalValue] = useState(defaultValue)
  const [dragging, setDragging] = useState(false)
  const currentValue = value ?? internalValue
  const attachments = useAttachments({ filesSlug, sdk })

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = '0px'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [currentValue])

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    const next = value ?? internalValue
    if ((!next.trim() && !attachments.references.length) || pending || disabled || attachments.uploading) return
    void Promise.resolve(onSubmit(next, attachments.references)).then(attachments.clear)
    if (value === undefined) setInternalValue('')
    onValueChange?.('')
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(event)
    if (event.defaultPrevented || event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    submit()
  }

  const handleDrag = (event: DragEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!disabled) setDragging(event.type === 'dragenter' || event.type === 'dragover')
  }

  return <form className={cn('relative w-full min-w-0', disabled && 'opacity-50', className)} onSubmit={submit} onDragEnter={handleDrag} onDragOver={handleDrag} onDragLeave={handleDrag} onDrop={(event) => {
    event.preventDefault()
    setDragging(false)
    if (!disabled && !pending) attachments.add(Array.from(event.dataTransfer.files))
  }}>
    <AttachmentPreviews items={attachments.items} remove={attachments.remove} retry={attachments.retry} />
    <div className={cn('gradient-wrapper relative z-10 w-full', dragging && 'gradient-wrapper-dragging')}>
      <div className="gradient-container block w-full">
      <div className="rounded-[20px] border border-solid border-base-300 bg-base-200 p-3">
        <textarea {...props} ref={textareaRef} disabled={disabled} rows={1} value={currentValue} onChange={(event) => {
          if (value === undefined) setInternalValue(event.target.value)
          onValueChange?.(event.target.value)
        }} onKeyDown={handleKeyDown} className="gradient-textarea mb-4 max-h-[calc(75dvh)] min-h-10 w-full resize-none overflow-y-auto border-none bg-base-200 pl-2 pt-2 font-payload text-base outline-none transition-all duration-300 placeholder:text-base-500 disabled:cursor-not-allowed disabled:opacity-50" />
        <div className="flex items-end justify-between">
          <div className="flex min-w-0 flex-wrap gap-1">{sdk && filesSlug && <AttachmentControl add={attachments.add} disabled={disabled || pending} />}{startSlot}</div>
          <div className="flex items-center justify-end gap-1">
            {endSlot}
            {!disabled && (pending
              ? <button type="button" onClick={onStop} className="slide-up-1 clear-button rounded-full bg-base-300 p-1.5 text-base-700 hover:bg-base-400 hover:text-base-1000 active:text-base-1000 sm:p-2" aria-label={typeof stopContent === 'string' ? stopContent : 'Stop response'}><Square className="size-5 fill-current sm:size-6" /><span className="sr-only">{stopContent}</span></button>
              : (currentValue.trim() || attachments.references.length > 0) && !attachments.uploading && <button type="submit" className="slide-up-1 clear-button -ml-1 rounded-full bg-brand-500 p-1.5 text-base-1000 hover:bg-brand-600 active:bg-brand-300 sm:p-2" aria-label={typeof submitContent === 'string' ? submitContent : 'Submit'}><ArrowUp className="size-5 sm:size-6" /><span className="sr-only">{submitContent}</span></button>)}
          </div>
        </div>
      </div>
    </div>
    </div>
  </form>
}
