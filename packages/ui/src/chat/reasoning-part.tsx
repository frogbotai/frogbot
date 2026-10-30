import type { ReasoningUIPart } from 'ai';

import ChevronDownIcon from '../icons/icons/ChevronDownIcon.js';
import { Markdown } from './markdown.js';
import { Thinking } from './thinking.js';
import { useLive, usePacedText } from './use-paced-text.js';

export function ReasoningPart({ part }: { part: ReasoningUIPart }) {
  const live = useLive(part.state);
  const text = usePacedText(part.text, live);

  return (
    <details className="fb-reasoning-part" data-part="reasoning" data-state={part.state}>
      <summary className="fb-reasoning-part__summary">
        {live ? <Thinking /> : 'Thought'}
        <ChevronDownIcon className="fb-reasoning-part__chevron" aria-hidden />
      </summary>
      <div className="fb-reasoning-part__content">
        <Markdown>{text}</Markdown>
      </div>
    </details>
  );
}
