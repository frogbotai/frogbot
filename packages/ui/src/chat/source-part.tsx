import type { SourceDocumentUIPart, SourceUrlUIPart } from 'ai'

export function SourcePart({ part }: { part: SourceDocumentUIPart | SourceUrlUIPart }) {
  if (part.type === 'source-url') return <a data-part="source-url" href={part.url} target="_blank" rel="noreferrer" className="text-sm text-primary underline underline-offset-2">{part.title || part.url}</a>
  return <span data-part="source-document" className="inline-flex rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">{part.title}{part.filename ? ` (${part.filename})` : ''}</span>
}
