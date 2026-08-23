import type { DataPartValue } from './data-part';

export type PastePartData = { filename?: string; text: string };
export type PageContextPartData = {
  content: string;
  favicon?: string;
  tabId: number;
  title: string;
  url: string;
};
export type PromptPartData = { id: string; title: string };

export function isFlagPart(part: { type: string }) {
  return (
    part.type === 'data-paste' || part.type === 'data-page-context' || part.type === 'data-prompt'
  );
}

export function renderFlagPart(part: DataPartValue) {
  if (part.type === 'data-paste') {
    const data = part.data as PastePartData;
    return (
      <div
        data-testid="data-paste"
        className="fb-flag-part fb-flag-part--paste"
      >
        <div className="fb-flag-part__preview">
          {data.text}
        </div>
        <div className="fb-flag-part__label">
          PASTED
        </div>
      </div>
    );
  }
  if (part.type === 'data-page-context') {
    const data = part.data as PageContextPartData;
    return (
      <article
        data-testid="data-page-context"
        className="fb-flag-part fb-flag-part--page-context"
      >
        <div className="fb-flag-part__header">
          {data.favicon && <img src={data.favicon} alt="" className="fb-flag-part__favicon" />}
          <strong>{data.title}</strong>
        </div>
        <a href={data.url} className="fb-flag-part__url">
          {data.url}
        </a>
        <p className="fb-flag-part__content">{data.content}</p>
      </article>
    );
  }
  const data = part.data as PromptPartData;
  return (
    <div
      data-testid="data-prompt"
      className="fb-flag-part fb-flag-part--prompt"
    >
      <div className="fb-flag-part__preview fb-flag-part__preview--prompt">
        {data.title}
      </div>
      <div className="fb-flag-part__label">
        PROMPT
      </div>
    </div>
  );
}
