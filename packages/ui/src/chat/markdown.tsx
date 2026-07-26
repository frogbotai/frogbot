import { Fragment, type ReactNode } from 'react'

import { CodeBlock } from './code-block'

export interface MarkdownProps { children: string }

function safeUrl(url: string) {
  return /^(https?:|mailto:|\/|#)/i.test(url) ? url : undefined
}

function inline(text: string): ReactNode[] {
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^\s)]+\))/g
  return text.split(pattern).filter(Boolean).map((token, index) => {
    if (token.startsWith('`')) return <code key={index} className="rounded bg-muted px-1 py-0.5 font-mono text-sm">{token.slice(1, -1)}</code>
    if (token.startsWith('**')) return <strong key={index}>{token.slice(2, -2)}</strong>
    const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (link) {
      const href = safeUrl(link[2])
      return href ? <a key={index} href={href} rel="noreferrer" target={href.startsWith('http') ? '_blank' : undefined} className="text-primary underline underline-offset-2">{link[1]}</a> : <Fragment key={index}>{link[1]}</Fragment>
    }
    return <Fragment key={index}>{token}</Fragment>
  })
}

export function Markdown({ children }: MarkdownProps) {
  return <div className="space-y-3 break-words" data-markdown>{children.split(/\n{2,}(?![^`]*```)/).map((block, index) => {
    const fence = block.match(/^```([^\n]*)\n([\s\S]*?)\n?```$/)
    if (fence) return <CodeBlock key={index} language={fence[1] || undefined} code={fence[2]} />
    const heading = block.match(/^(#{1,3})\s+(.+)$/s)
    if (heading) return <div key={index} role="heading" aria-level={heading[1].length} className="font-semibold">{inline(heading[2])}</div>
    if (block.split('\n').every((line) => /^[-*]\s+/.test(line))) return <ul key={index} className="list-disc space-y-1 pl-5">{block.split('\n').map((line, item) => <li key={item}>{inline(line.slice(2))}</li>)}</ul>
    return <p key={index} className="whitespace-pre-wrap leading-7">{inline(block)}</p>
  })}</div>
}
