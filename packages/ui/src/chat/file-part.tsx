import type { FileUIPart, ReasoningFileUIPart } from 'ai';

export function FilePart({ part }: { part: FileUIPart | ReasoningFileUIPart }) {
  const filename = part.type === 'file' ? part.filename : undefined;
  const label =
    filename || (part.type === 'reasoning-file' ? 'Reasoning attachment' : 'Attachment');
  if (part.mediaType.startsWith('image/')) {
    return (
      <figure data-part={part.type} className="fb-file-part fb-file-part--image">
        <img src={part.url} alt={label} className="fb-file-part__image" />
        {filename && <figcaption className="fb-file-part__caption">{filename}</figcaption>}
      </figure>
    );
  }
  return (
    <a
      data-part={part.type}
      href={part.url}
      download={filename}
      className="fb-file-part fb-file-part--download"
    >
      {label}
    </a>
  );
}
