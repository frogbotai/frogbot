'use client'

import type { FrogBotSDK } from '@frogbotai/sdk'
import { FileIcon, LoaderCircle, Plus, RotateCcw, X } from 'lucide-react'
import { type ChangeEvent, useRef, useState } from 'react'

export type FileReference = {
  id: string | number
  filename: string
  mediaType: string
}

export type PasteAttachment = {
  filename: string
  text: string
  type: 'paste'
}

export type ComposerAttachment = FileReference | PasteAttachment

type UploadItem = {
  key: number
  file: File
  preview?: string
  reference?: FileReference
  error?: string
  uploading: boolean
}

export function useAttachments({ filesSlug, sdk }: { filesSlug?: string; sdk?: FrogBotSDK }) {
  const nextKey = useRef(0)
  const [items, setItems] = useState<UploadItem[]>([])

  const upload = async (item: UploadItem) => {
    if (!sdk || !filesSlug) return
    setItems((current) => current.map((entry) => entry.key === item.key ? { ...entry, error: undefined, uploading: true } : entry))
    try {
      const uploaded = await sdk.upload(filesSlug, item.file)
      setItems((current) => current.map((entry) => entry.key === item.key ? {
        ...entry,
        reference: { id: uploaded.id, filename: uploaded.filename, mediaType: uploaded.mimeType },
        uploading: false,
      } : entry))
    } catch (error) {
      setItems((current) => current.map((entry) => entry.key === item.key ? { ...entry, error: error instanceof Error ? error.message : 'Upload failed', uploading: false } : entry))
    }
  }

  const add = (files: File[]) => {
    const added = files.map((file) => ({
      key: nextKey.current++,
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      uploading: true,
    }))
    setItems((current) => [...current, ...added])
    for (const item of added) void upload(item)
  }

  const remove = (key: number) => setItems((current) => {
    const item = current.find((entry) => entry.key === key)
    if (item?.preview) URL.revokeObjectURL(item.preview)
    return current.filter((entry) => entry.key !== key)
  })
  const clear = () => setItems((current) => {
    for (const item of current) if (item.preview) URL.revokeObjectURL(item.preview)
    return []
  })

  return {
    add,
    clear,
    items,
    references: items.flatMap((item) => item.reference ? [item.reference] : []),
    remove,
    retry: (key: number) => {
      const item = items.find((entry) => entry.key === key)
      if (item) void upload(item)
    },
    uploading: items.some((item) => item.uploading),
  }
}

export function AttachmentControl({ add, disabled }: { add: (files: File[]) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const select = (event: ChangeEvent<HTMLInputElement>) => {
    add(Array.from(event.target.files ?? []))
    event.target.value = ''
  }
  return <><input ref={input} type="file" multiple tabIndex={-1} className="pointer-events-none fixed -left-4 -top-4 size-0.5 opacity-0" onChange={select} /><button type="button" disabled={disabled} aria-label="Add files" onClick={() => input.current?.click()} className="slide-up-1 clear-button rounded-full p-1.5 text-base-700 hover:bg-base-300 hover:text-base-1000 active:bg-base-400 sm:p-2"><Plus className="size-5 sm:size-6" /></button></>
}

export function AttachmentPreviews({ items, remove, retry }: { items: UploadItem[]; remove: (key: number) => void; retry: (key: number) => void }) {
  if (!items.length) return null
  return <div className="relative mb-4 w-full"><div className="flex w-0 min-w-full flex-row items-end gap-2 overflow-x-auto">{items.map((item) => <div key={item.key} className="mb-4 flex flex-col gap-2">
    <div className="relative flex aspect-video size-[120px] flex-col items-center justify-center rounded-md border border-solid border-muted bg-muted hover:border-border">
      {item.preview ? <img src={item.preview} alt={item.file.name} className="size-full rounded-md object-cover" /> : <><FileIcon className="size-4" /><p className="max-w-24 truncate text-xs">{item.file.name}</p></>}
      {item.uploading && <LoaderCircle aria-label={`Uploading ${item.file.name}`} className="absolute size-5 animate-spin text-base-500" />}
      {item.error && <button type="button" aria-label={`Retry ${item.file.name}`} title={item.error} onClick={() => retry(item.key)} className="absolute bottom-1 left-1 rounded-full bg-base-300 p-1 text-red-500"><RotateCcw className="size-3" /></button>}
      <button type="button" aria-label={`Remove ${item.file.name}`} onClick={() => remove(item.key)} className="absolute right-0 top-0 mr-1 mt-1 flex size-5 items-center justify-center rounded-full border-0 bg-border p-0 hover:bg-red-500"><X className="size-3" /></button>
    </div>
  </div>)}</div></div>
}

export function PastePreviews({ items, remove }: { items: PasteAttachment[]; remove: (index: number) => void }) {
  if (!items.length) return null
  return <div className="relative mb-4 w-full"><div className="flex w-0 min-w-full flex-row items-end gap-2 overflow-x-auto">{items.map((item, index) => <div key={item.filename} data-testid="paste-attachment" className="relative mb-2 size-[120px] shrink-0 rounded-lg border border-solid border-border bg-base-200 p-2 text-xs text-[var(--theme-text)]"><div className="line-clamp-6 whitespace-pre-wrap break-words font-mono text-[10px] leading-snug opacity-90">{item.text}</div><button type="button" aria-label={`Remove ${item.filename}`} onClick={() => remove(index)} className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full border-0 bg-border p-0 hover:bg-red-500"><X className="size-3" /></button><div className="pointer-events-none absolute -bottom-2 left-2 rounded-full bg-base-300 px-2 py-[2px] text-[9px] font-semibold tracking-wide text-zinc-300">PASTED</div></div>)}</div></div>
}
