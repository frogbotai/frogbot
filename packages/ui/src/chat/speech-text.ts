import MarkdownIt from 'markdown-it';

const markdown = new MarkdownIt({ html: true });

type Token = ReturnType<MarkdownIt['parse']>[number];

const SKIPPED_BLOCKS = new Set(['fence', 'code_block', 'html_block']);

function inlineText(children: Token[]): string {
  return children
    .map((child) => {
      if (child.type === 'text') return child.content;
      if (child.type === 'softbreak' || child.type === 'hardbreak') return ' ';
      if (child.type === 'html_inline' && /^<br\b/i.test(child.content)) return ' ';

      return '';
    })
    .join('');
}

/** The words of a markdown reply worth reading aloud: formatting, code and images removed. */
export function speechText(source: string): string {
  const parts: string[] = [];

  for (const token of markdown.parse(source, {})) {
    if (SKIPPED_BLOCKS.has(token.type)) continue;
    if (token.type === 'inline') parts.push(inlineText(token.children ?? []));
    else if (token.nesting === -1) parts.push('\n\n');
  }

  return parts
    .join('')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

const sentenceSegmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'sentence' })
    : undefined;

const SPLITTERS: [split: (text: string) => string[], separator: string][] = [
  [(text) => text.split(/\n{2,}/), '\n\n'],
  [
    (text) =>
      sentenceSegmenter
        ? Array.from(sentenceSegmenter.segment(text), ({ segment }) => segment.trim())
        : text.split(/(?<=[.!?])\s+/),
    ' ',
  ],
  [(text) => text.split(/\s+/), ' '],
];

function pack(text: string, max: number, level: number): string[] {
  if (text.length <= max) return [text];

  const splitter = SPLITTERS[level];

  if (!splitter) {
    return Array.from({ length: Math.ceil(text.length / max) }, (_, index) =>
      text.slice(index * max, (index + 1) * max),
    );
  }

  const [split, separator] = splitter;
  const chunks: string[] = [];
  let current = '';

  for (const part of split(text)) {
    if (!part) continue;

    for (const piece of pack(part, max, level + 1)) {
      if (!current) current = piece;
      else if (current.length + separator.length + piece.length <= max) {
        current += separator + piece;
      } else {
        chunks.push(current);
        current = piece;
      }
    }
  }

  if (current) chunks.push(current);

  return chunks;
}

/**
 * Splits text into pieces of at most `max` characters, at paragraph, then sentence, then word
 * boundaries, so each fits one speech request.
 */
export function speechChunks(text: string, max = 4000): string[] {
  return text ? pack(text, max, 0) : [];
}
