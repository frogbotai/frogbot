import type { DataPartValue } from './data-part'

export type PastePartData = { filename?: string; text: string }
export type PageContextPartData = { content: string; favicon?: string; tabId: number; title: string; url: string }
export type PromptPartData = { id: string; title: string }

export function isFlagPart(part: { type: string }) {
  return part.type === 'data-paste' || part.type === 'data-page-context' || part.type === 'data-prompt'
}

export function renderFlagPart(part: DataPartValue) {
  if (part.type === 'data-paste') {
    const data = part.data as PastePartData
    return <div data-testid="data-paste" className="relative mb-2 size-[120px] rounded-lg border border-solid border-border bg-base-200 p-2 text-xs text-[var(--theme-text)]"><div className="line-clamp-6 whitespace-pre-wrap break-words font-mono text-[10px] leading-snug opacity-90">{data.text}</div><div className="pointer-events-none absolute -bottom-2 left-2 rounded-full bg-base-300 px-2 py-[2px] text-[9px] font-semibold tracking-wide text-zinc-300">PASTED</div></div>
  }
  if (part.type === 'data-page-context') {
    const data = part.data as PageContextPartData
    return <article data-testid="data-page-context" className="rounded-lg border border-border bg-muted p-3"><div className="flex items-center gap-2">{data.favicon && <img src={data.favicon} alt="" className="size-5 rounded" />}<strong>{data.title}</strong></div><a href={data.url} className="text-xs text-base-600">{data.url}</a><p className="mt-2 whitespace-pre-wrap text-sm">{data.content}</p></article>
  }
  const data = part.data as PromptPartData
  return <div data-testid="data-prompt" className="relative mb-2 max-h-[120px] w-[120px] rounded-lg border border-solid border-border bg-base-200 p-2 text-xs text-[var(--theme-text)]"><div className="line-clamp-6 whitespace-pre-wrap break-words pb-3 font-mono text-[10px] leading-snug opacity-90">{data.title}</div><div className="pointer-events-none absolute -bottom-2 left-2 rounded-full bg-base-300 px-2 py-[2px] text-[9px] font-semibold tracking-wide text-zinc-300">PROMPT</div></div>
}
