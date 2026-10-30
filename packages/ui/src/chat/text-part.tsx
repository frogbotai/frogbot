import type { TextUIPart } from 'ai';

import { Markdown } from './markdown.js';
import { useLive, usePacedText } from './use-paced-text.js';

export function TextPart({
  part,
  role,
}: {
  part: TextUIPart;
  role?: 'user' | 'assistant' | 'system';
}) {
  const live = useLive(part.state);
  const text = usePacedText(part.text, live);

  return (
    <div data-part="text" data-state={part.state}>
      <Markdown role={role}>{text}</Markdown>
    </div>
  );
}
