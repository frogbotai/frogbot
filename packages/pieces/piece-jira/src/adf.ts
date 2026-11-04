import { z } from 'zod';

type Mark =
  { type: 'strong' | 'em' | 'strike' | 'code' } | { type: 'link'; attrs: { href: string } };

export type AdfNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: AdfNode[];
  marks?: Mark[];
  text?: string;
};

export type AdfDoc = { type: 'doc'; version: 1; content: AdfNode[] };

export const adfDoc = z
  .object({
    type: z.literal('doc'),
    version: z.literal(1),
    content: z.array(z.looseObject({ type: z.string() })),
  })
  .passthrough()
  .meta({ description: 'An Atlassian Document Format (ADF) document.' });

export const richText = z
  .union([z.string(), adfDoc])
  .meta({ description: 'Markdown, or an Atlassian Document Format (ADF) document.' });

const delimiters = [
  ['**', 'strong'],
  ['__', 'strong'],
  ['~~', 'strike'],
  ['*', 'em'],
  ['_', 'em'],
] as const;

const escapable = /[\\`*_~[\]()#>!+\-.|{}]/;

function text(value: string, marks: Mark[]): AdfNode {
  return marks.length ? { type: 'text', text: value, marks } : { type: 'text', text: value };
}

function isWord(char: string | undefined) {
  return char !== undefined && /[\p{L}\p{N}]/u.test(char);
}

function closing(source: string, delimiter: string, from: number) {
  for (let index = from; index < source.length; index++) {
    if (source[index] === '\\') {
      index++;
      continue;
    }

    if (source[index] === '`') {
      const end = source.indexOf('`', index + 1);

      if (end !== -1) index = end;
      continue;
    }

    if (!source.startsWith(delimiter, index) || /\s/.test(source[index - 1] ?? ' ')) continue;

    if (delimiter.length === 1) {
      if (source[index + 1] === delimiter || source[index - 1] === delimiter) continue;
      if (delimiter === '_' && isWord(source[index + 1])) continue;
    }

    return index;
  }

  return -1;
}

function safeHref(href: string) {
  return URL.canParse(href) && ['http:', 'https:', 'mailto:'].includes(new URL(href).protocol);
}

function inline(source: string, marks: Mark[] = []): AdfNode[] {
  const nodes: AdfNode[] = [];
  let buffer = '';

  const flush = () => {
    if (buffer) nodes.push(text(buffer, marks));
    buffer = '';
  };

  scan: for (let index = 0; index < source.length;) {
    const char = source[index];

    if (char === '\\' && escapable.test(source[index + 1] ?? '')) {
      buffer += source[index + 1];
      index += 2;
      continue;
    }

    if (char === '`') {
      const end = source.indexOf('`', index + 1);

      if (end > index + 1) {
        flush();

        nodes.push(
          text(source.slice(index + 1, end), [
            ...marks.filter((mark) => mark.type === 'link'),
            { type: 'code' },
          ]),
        );

        index = end + 1;
        continue;
      }
    }

    if (char === '[') {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(source.slice(index));

      if (link && safeHref(link[2])) {
        flush();
        nodes.push(...inline(link[1], [...marks, { type: 'link', attrs: { href: link[2] } }]));
        index += link[0].length;
        continue;
      }
    }

    for (const [delimiter, type] of delimiters) {
      if (!source.startsWith(delimiter, index)) continue;
      if (delimiter === '_' && isWord(source[index - 1])) break;

      const start = index + delimiter.length;

      if (/\s/.test(source[start] ?? ' ')) break;

      const end = closing(source, delimiter, start);

      if (end === -1) continue;

      flush();
      nodes.push(...inline(source.slice(start, end), [...marks, { type }]));
      index = end + delimiter.length;
      continue scan;
    }

    buffer += char;
    index++;
  }

  flush();

  return nodes;
}

function lines(source: string[]): AdfNode[] {
  const paragraph: AdfNode[] = [];

  source.forEach((line, index) => {
    if (index > 0) paragraph.push({ type: 'hardBreak' });
    paragraph.push(...inline(line.trim()));
  });

  return paragraph;
}

const listMarker = /^( {0,3})([-*+]|\d{1,9}[.)])\s+(.*)$/;
const fence = /^ {0,3}(```|~~~)\s*([\w+-]*)\s*$/;
const heading = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const rule = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const quote = /^ {0,3}>\s?(.*)$/;

function startsBlock(line: string) {
  return (
    fence.test(line) ||
    heading.test(line) ||
    rule.test(line) ||
    quote.test(line) ||
    listMarker.test(line)
  );
}

function blocks(source: string[]): AdfNode[] {
  const nodes: AdfNode[] = [];
  let index = 0;

  while (index < source.length) {
    const line = source[index];

    if (!line.trim()) {
      index++;
      continue;
    }

    const opened = fence.exec(line);

    if (opened) {
      const body: string[] = [];

      index++;

      while (index < source.length && !source[index].trim().startsWith(opened[1])) {
        body.push(source[index]);
        index++;
      }

      index++;

      const code = body.join('\n');

      nodes.push({
        type: 'codeBlock',
        ...(opened[2] ? { attrs: { language: opened[2] } } : {}),
        content: code ? [{ type: 'text', text: code }] : [],
      });

      continue;
    }

    const title = heading.exec(line);

    if (title) {
      nodes.push({
        type: 'heading',
        attrs: { level: title[1].length },
        content: inline(title[2]),
      });

      index++;
      continue;
    }

    if (rule.test(line)) {
      nodes.push({ type: 'rule' });
      index++;
      continue;
    }

    if (quote.test(line)) {
      const quoted: string[] = [];

      while (index < source.length && quote.test(source[index])) {
        quoted.push(quote.exec(source[index])![1]);
        index++;
      }

      nodes.push({ type: 'blockquote', content: blocks(quoted) });
      continue;
    }

    const item = listMarker.exec(line);

    if (item) {
      const ordered = /\d/.test(item[2]);
      const indent = item[1].length;
      const items: AdfNode[] = [];

      while (index < source.length) {
        const current = listMarker.exec(source[index]);

        if (!current || current[1].length !== indent || /\d/.test(current[2]) !== ordered) break;

        const width = current[1].length + current[2].length + 1;
        const body = [current[3]];

        index++;

        while (
          index < source.length &&
          source[index].trim() &&
          source[index].search(/\S/) > indent
        ) {
          const next = source[index];

          body.push(next.slice(Math.min(width, next.search(/\S/))));
          index++;
        }

        const content = blocks(body);

        items.push({
          type: 'listItem',
          content: content.length ? content : [{ type: 'paragraph', content: [] }],
        });
      }

      const start = ordered ? Number.parseInt(item[2], 10) : 1;

      nodes.push(
        ordered
          ? { type: 'orderedList', attrs: { order: start }, content: items }
          : { type: 'bulletList', content: items },
      );

      continue;
    }

    const paragraph: string[] = [];

    while (
      index < source.length &&
      source[index].trim() &&
      (paragraph.length === 0 || !startsBlock(source[index]))
    ) {
      paragraph.push(source[index]);
      index++;
    }

    nodes.push({ type: 'paragraph', content: lines(paragraph) });
  }

  return nodes;
}

/** Markdown to an ADF document. Syntax it doesn't know, such as tables, stays as text. */
export function markdownToAdf(markdown: string): AdfDoc {
  return { type: 'doc', version: 1, content: blocks(markdown.replace(/\r\n?/g, '\n').split('\n')) };
}

/** An ADF document as given, a JSON string of one, or markdown converted to one. */
export function toAdf(value: string | z.output<typeof adfDoc>): AdfDoc {
  if (typeof value !== 'string') return value;

  if (value.trimStart().startsWith('{')) {
    const parsed = adfDoc.safeParse(
      (() => {
        try {
          return JSON.parse(value) as unknown;
        } catch {
          return undefined;
        }
      })(),
    );

    if (parsed.success) return parsed.data;
  }

  return markdownToAdf(value);
}
