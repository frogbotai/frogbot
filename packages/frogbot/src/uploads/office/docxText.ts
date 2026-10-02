import { OfficeFileError } from './zipGuard.js';

type HtmlElement = {
  tag: string;
  attributes: Record<string, string>;
  children: HtmlNode[];
};

type HtmlNode = HtmlElement | string;

const TOKEN = /<(\/?)([a-z0-9]+)((?:\s+[a-z-]+="[^"]*")*)\s*(\/?)>|([^<]+)/g;

const ATTRIBUTE = /([a-z-]+)="([^"]*)"/g;

const ENTITY = /&(amp|lt|gt|quot);/g;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"' };

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

const BLOCKS = new Set([...HEADINGS, 'p', 'ul', 'ol', 'table']);

const LISTS = new Set(['ul', 'ol']);

const BACK_LINK = /^#(footnote|endnote|comment)-ref-/;

function decode(value: string): string {
  return value.replace(ENTITY, (_, name: string) => ENTITIES[name]);
}

function isElement(node: HtmlNode, tags: Set<string>): node is HtmlElement {
  return typeof node !== 'string' && tags.has(node.tag);
}

function elements(nodes: HtmlNode[]): HtmlElement[] {
  return nodes.filter((node): node is HtmlElement => typeof node !== 'string');
}

function parseHtml(html: string): HtmlElement {
  const root: HtmlElement = { tag: 'root', attributes: {}, children: [] };
  const stack = [root];

  for (const [, closing, tag, attributes, selfClosing, text] of html.matchAll(TOKEN)) {
    const parent = stack[stack.length - 1];

    if (text !== undefined) {
      parent.children.push(decode(text));
    } else if (closing) {
      if (stack.length > 1) stack.pop();
    } else {
      const element: HtmlElement = {
        tag,
        attributes: Object.fromEntries(
          [...attributes.matchAll(ATTRIBUTE)].map(([, name, value]) => [name, decode(value)]),
        ),
        children: [],
      };

      parent.children.push(element);

      if (!selfClosing) stack.push(element);
    }
  }

  return root;
}

function renderLink(link: HtmlElement): string {
  const href = link.attributes.href;

  if (href && BACK_LINK.test(href)) return '';

  const text = renderInline(link.children);

  if (!href || href.startsWith('#')) return text;

  const label = text.trim();

  return label && label !== href ? `${label} (${href})` : href;
}

function renderInline(nodes: HtmlNode[]): string {
  return nodes
    .map((node) => {
      if (typeof node === 'string') return node;

      if (node.tag === 'br') return '\n';

      if (node.tag === 'img') return '';

      if (node.tag === 'input') return node.attributes.checked ? '[x]' : '[ ]';

      if (node.tag === 'a') return renderLink(node);

      return renderInline(node.children);
    })
    .join('');
}

function renderList(list: HtmlElement): string[] {
  const lines: string[] = [];

  elements(list.children).forEach((item, index) => {
    const marker = list.tag === 'ol' ? `${index + 1}.` : '-';
    const indent = ' '.repeat(marker.length + 1);
    const content = item.children.filter((child) => !isElement(child, LISTS));
    const text = renderBlocks(content).join('\n').replace(/\n/g, `\n${indent}`);

    if (text) lines.push(`${marker} ${text}`);

    item.children.forEach((child) => {
      if (!isElement(child, LISTS)) return;

      renderList(child).forEach((line) => lines.push(`${indent}${line}`));
    });
  });

  return lines;
}

function renderCell(cell: HtmlElement): string {
  return renderBlocks(cell.children)
    .join(' ')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\|/g, '\\|');
}

function span(cell: HtmlElement, name: 'colspan' | 'rowspan'): number {
  return Number(cell.attributes[name] ?? 1);
}

function tableGrid(rows: HtmlElement[]): string[][] {
  const covered: number[] = [];

  return rows.map((row) => {
    const cells: string[] = [];

    const skipCovered = () => {
      while (covered[cells.length] > 0) {
        covered[cells.length] -= 1;
        cells.push('');
      }
    };

    elements(row.children).forEach((cell) => {
      skipCovered();

      const text = renderCell(cell);
      const rowspan = span(cell, 'rowspan');

      for (let column = 0; column < span(cell, 'colspan'); column++) {
        covered[cells.length] = rowspan - 1;
        cells.push(column === 0 ? text : '');
      }
    });

    skipCovered();

    return cells;
  });
}

function tableRow(cells: string[]): string {
  return `| ${cells.join(' | ')} |`;
}

function renderTable(table: HtmlElement): string {
  const rows = elements(table.children).flatMap((child) =>
    child.tag === 'tr' ? [child] : elements(child.children),
  );

  const grid = tableGrid(rows).filter((cells) => cells.length > 0);

  if (grid.length === 0) return '';

  const columns = Math.max(...grid.map((cells) => cells.length));
  const lines = grid.map(tableRow);

  lines.splice(1, 0, tableRow(Array(columns).fill('---')));

  return lines.join('\n');
}

function renderBlock(element: HtmlElement): string {
  if (HEADINGS.has(element.tag)) {
    const text = renderInline(element.children).trim();

    return text && `${'#'.repeat(Number(element.tag[1]))} ${text}`;
  }

  if (LISTS.has(element.tag)) return renderList(element).join('\n');

  if (element.tag === 'table') return renderTable(element);

  return renderInline(element.children).trim();
}

function renderBlocks(nodes: HtmlNode[]): string[] {
  const blocks: string[] = [];

  let inline: HtmlNode[] = [];

  const flush = () => {
    const text = renderInline(inline).trim();

    if (text) blocks.push(text);

    inline = [];
  };

  nodes.forEach((node) => {
    if (!isElement(node, BLOCKS)) {
      inline.push(node);

      return;
    }

    flush();

    const text = renderBlock(node);

    if (text) blocks.push(text);
  });

  flush();

  return blocks;
}

function removeControls(text: string): string {
  return text.replace(/\p{Cc}/gu, (character) =>
    character === '\t' || character === '\n' ? character : '',
  );
}

export async function docxText(bytes: Uint8Array): Promise<string> {
  const { default: mammoth } = await import('mammoth');

  const result = await mammoth
    .convertToHtml(
      { buffer: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) },
      {
        convertImage: mammoth.images.imgElement(async () => ({ src: '' })),
        includeEmbeddedStyleMap: false,
      },
    )
    .catch((error: unknown) => {
      throw new OfficeFileError('invalid', { cause: error });
    });

  return removeControls(renderBlocks(parseHtml(result.value).children).join('\n\n'));
}
