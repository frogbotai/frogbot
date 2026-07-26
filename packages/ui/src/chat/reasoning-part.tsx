import type { ReasoningUIPart } from 'ai'

import { Markdown } from './markdown'

export function ReasoningPart({ part }: { part: ReasoningUIPart }) {
  return <details className="rounded-lg border border-border bg-muted/40 p-3" data-part="reasoning" data-state={part.state} open={part.state === 'streaming' || undefined}>
    <summary className="cursor-pointer text-sm font-medium text-muted-foreground">{part.state === 'streaming' ? 'Thinking...' : 'Reasoning'}</summary>
    <div className="mt-3 text-sm text-muted-foreground"><Markdown>{part.text}</Markdown></div>
  </details>
}
