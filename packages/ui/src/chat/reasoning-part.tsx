import type { ReasoningUIPart } from 'ai';

import { Markdown } from './markdown';

export function ReasoningPart({ part }: { part: ReasoningUIPart }) {
  return (
    <details
      className="fb-reasoning-part"
      data-part="reasoning"
      data-state={part.state}
      open={part.state === 'streaming' || undefined}
    >
      <summary className="fb-reasoning-part__summary">
        {part.state === 'streaming' ? 'Thinking...' : 'Reasoning'}
      </summary>
      <div className="fb-reasoning-part__content">
        <Markdown>{part.text}</Markdown>
      </div>
    </details>
  );
}
