'use client'

import type { FrogBotSDK } from '@frogbotai/sdk'
import { FileIcon, LoaderCircle, Plus, RotateCcw, X } from 'lucide-react'
import { type ChangeEvent, useRef, useState } from 'react'

export type FileReference = {
  id: string | number
  filename: string
  mediaType: string
}

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
  return <div className="mb-2 flex max-w-full gap-2 overflow-x-auto px-1">{items.map((item) => <div key={item.key} className="relative flex min-w-28 max-w-44 items-center gap-2 rounded-xl border border-base-300 bg-base-200 p-2 text-xs">
    {item.preview ? <img src={item.preview} alt="" className="size-10 rounded-lg object-cover" /> : <FileIcon className="size-8 shrink-0 text-base-600" />}
    <span className="min-w-0 truncate">{item.file.name}</span>
    {item.uploading && <LoaderCircle aria-label={`Uploading ${item.file.name}`} className="size-4 shrink-0 animate-spin" />}
    {item.error && <button type="button" aria-label={`Retry ${item.file.name}`} title={item.error} onClick={() => retry(item.key)} className="text-error"><RotateCcw className="size-4" /></button>}
    <button type="button" aria-label={`Remove ${item.file.name}`} onClick={() => remove(item.key)} className="absolute -right-1 -top-1 rounded-full bg-base-300 p-0.5"><X className="size-3" /></button>
  </div>)}</div>
}
