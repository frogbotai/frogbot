'use client';

import { isSourcePart, SourcePart } from './source-part.js';

/** A message's sources, as one list under its answer. Renders nothing when it has none. */
export function SourceList({ parts }: { parts: readonly { type: string }[] }) {
  const sources = parts.filter(isSourcePart);

  if (sources.length === 0) return null;

  return (
    <ul data-part="sources" className="fb-source-list">
      {sources.map((part, index) => (
        <li key={`${part.sourceId}-${index}`} className="fb-source-list__item">
          <SourcePart part={part} />
        </li>
      ))}
    </ul>
  );
}
