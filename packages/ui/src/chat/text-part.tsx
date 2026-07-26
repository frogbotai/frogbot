import type { TextUIPart } from 'ai'

import { Markdown } from './markdown'

export function TextPart({ part }: { part: TextUIPart }) {
  return <div data-part="text" data-state={part.state}><Markdown>{part.text}</Markdown></div>
}
