import type { TextUIPart } from 'ai';

import { Markdown } from './markdown.js';
import { usePacedText } from './use-paced-text.js';

export function TextPart({
  part,
  role,
}: {
  part: TextUIPart;
  role?: 'user' | 'assistant' | 'system';
}) {
  const text = usePacedText(part.text, part.state === 'streaming');

  return (
    <div data-part="text" data-state={part.state}>
      <Markdown role={role}>{text}</Markdown>
    </div>
  );
}
