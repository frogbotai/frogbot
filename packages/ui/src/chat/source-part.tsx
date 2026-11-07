import type { SourceDocumentUIPart, SourceUrlUIPart } from 'ai';

import { useChatProvider } from './provider.js';

/** The record a tool source points at, from its `providerMetadata.frogbot`. */
export type SourceRecord = { collection: string; id: number | string };

export function sourceRecord(part: SourceDocumentUIPart): SourceRecord | undefined {
  const record = part.providerMetadata?.frogbot;

  if (!record || typeof record !== 'object' || Array.isArray(record)) return undefined;

  const { collection, id } = record;

  if (typeof collection !== 'string' || (typeof id !== 'string' && typeof id !== 'number')) {
    return undefined;
  }

  return { collection, id };
}

export function SourcePart({ part }: { part: SourceDocumentUIPart | SourceUrlUIPart }) {
  const sourceHref = useChatProvider()?.sourceHref;

  if (part.type === 'source-url') {
    return (
      <a
        data-part="source-url"
        href={part.url}
        target="_blank"
        rel="noreferrer"
        className="fb-source-part fb-source-part--url"
      >
        {part.title || part.url}
      </a>
    );
  }

  const record = sourceRecord(part);
  const href = record && sourceHref?.(record);
  const label = (
    <>
      {part.title}
      {part.filename ? ` (${part.filename})` : ''}
    </>
  );

  if (href) {
    return (
      <a
        data-part="source-document"
        href={href}
        className="fb-source-part fb-source-part--document fb-source-part--record"
      >
        {label}
      </a>
    );
  }

  return (
    <span data-part="source-document" className="fb-source-part fb-source-part--document">
      {label}
    </span>
  );
}
