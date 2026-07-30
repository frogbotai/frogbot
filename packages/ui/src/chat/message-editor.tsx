'use client'

import { type FormEvent,useState } from 'react'

export interface MessageEditorProps {
  initialValue: string
  onCancel?: () => void
  onSubmit: (value: string) => void | Promise<void>
}

export function MessageEditor({ initialValue, onCancel, onSubmit }: MessageEditorProps) {
  const [value, setValue] = useState(initialValue)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (value.trim()) void onSubmit(value)
  }
  return <form onSubmit={submit} className="space-y-2">
    <textarea aria-label="Edit message" value={value} onChange={(event) => setValue(event.target.value)} className="min-h-24 w-full resize-y rounded-lg border border-input bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
    <div className="flex justify-end gap-2">
      {onCancel && <button type="button" onClick={onCancel} className="rounded-md px-3 py-2 text-sm hover:bg-muted">Cancel</button>}
      <button type="submit" disabled={!value.trim()} className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">Send</button>
    </div>
  </form>
}
