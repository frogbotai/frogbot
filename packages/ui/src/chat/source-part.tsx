import type { SourceDocumentUIPart, SourceUrlUIPart } from 'ai';

export function SourcePart({ part }: { part: SourceDocumentUIPart | SourceUrlUIPart }) {
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
  return (
    <span data-part="source-document" className="fb-source-part fb-source-part--document">
      {part.title}
      {part.filename ? ` (${part.filename})` : ''}
    </span>
  );
}
