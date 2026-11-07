'use client';

import type { SourceDocumentUIPart, SourceUrlUIPart } from 'ai';

import { type SourceRecord, useChatProvider } from './provider.js';

export type SourcePartValue = SourceDocumentUIPart | SourceUrlUIPart;

export function isSourcePart(part: { type: string }): part is SourcePartValue {
  return part.type === 'source-url' || part.type === 'source-document';
}

function sourceRecord(part: SourceDocumentUIPart): SourceRecord | undefined {
  const record = part.providerMetadata?.frogbot;

  if (!record || typeof record !== 'object' || Array.isArray(record)) return undefined;

  const { collection, id } = record;

  if (typeof collection !== 'string' || (typeof id !== 'string' && typeof id !== 'number')) {
    return undefined;
  }

  return { collection, id };
}

export function SourcePart({ part }: { part: SourcePartValue }) {
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
  const label = (
    <>
      {part.title}
      {part.filename ? ` (${part.filename})` : ''}
    </>
  );

  if (record && sourceHref) {
    return (
      <a
        data-part="source-document"
        href={sourceHref(record)}
        className="fb-source-part fb-source-part--document"
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
