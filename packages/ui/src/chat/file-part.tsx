import type { FileUIPart, ReasoningFileUIPart } from 'ai'

export function FilePart({ part }: { part: FileUIPart | ReasoningFileUIPart }) {
  const filename = part.type === 'file' ? part.filename : undefined
  const label = filename || (part.type === 'reasoning-file' ? 'Reasoning attachment' : 'Attachment')
  if (part.mediaType.startsWith('image/')) return <figure data-part={part.type}><img src={part.url} alt={label} className="max-h-80 max-w-full rounded-lg border border-border object-contain" />{filename && <figcaption className="mt-1 text-xs text-muted-foreground">{filename}</figcaption>}</figure>
  return <a data-part={part.type} href={part.url} download={filename} className="inline-flex rounded-lg border border-border px-3 py-2 text-sm text-primary hover:bg-muted">{label}</a>
}
