import type { SourceDocumentUIPart, SourceUrlUIPart, UIMessage } from 'ai';

import type { MessagePartValue } from './message-part.js';
import { SourcePart } from './source-part.js';

type SourceUIPart = SourceDocumentUIPart | SourceUrlUIPart;

function isSourcePart(part: MessagePartValue): part is SourceUIPart {
  return part.type === 'source-url' || part.type === 'source-document';
}

/** A message's sources as one list, for under its answer. Renders nothing without sources. */
export function SourceList({
  parts,
}: {
  parts: readonly (UIMessage['parts'][number] | MessagePartValue)[];
}) {
  const sources = parts.filter(isSourcePart);

  if (sources.length === 0) return null;

  return (
    <ul data-part="sources" className="fb-source-list" aria-label="Sources">
      {sources.map((part, index) => (
        <li key={`${part.sourceId}-${index}`} className="fb-source-list__item">
          <SourcePart part={part} />
        </li>
      ))}
    </ul>
  );
}
