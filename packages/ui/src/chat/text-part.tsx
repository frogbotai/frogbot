import type { TextUIPart } from 'ai';

import { Markdown } from './markdown.js';

export function TextPart({
  part,
  role,
}: {
  part: TextUIPart;
  role?: 'user' | 'assistant' | 'system';
}) {
  return (
    <div data-part="text" data-state={part.state}>
      <Markdown role={role}>{part.text}</Markdown>
    </div>
  );
}
