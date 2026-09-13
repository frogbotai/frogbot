import { describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', async () => {
  const { definePiece } = await import('../../../packages/frogbot/src/pieces/definePiece.js');

  return { definePiece };
});

import { createTextHelper } from '../../../packages/pieces/piece-text-helper/src/index.js';

const text = createTextHelper();
const req = {} as never;

describe('text-helper execution', () => {
  it('concatenates and splits text', async () => {
    await expect(
      text.concatText({ input: { texts: ['frog', 2], separator: '-' }, req }),
    ).resolves.toBe('frog-2');

    await expect(
      text.splitText({ input: { text: 'frog,bot', delimiter: ',' }, req }),
    ).resolves.toEqual(['frog', 'bot']);
  });

  it('replaces either the first or every regex match', async () => {
    await expect(
      text.replaceText({
        input: {
          text: 'cat bat cat',
          searchValue: '[cb]at',
          replaceValue: 'frog',
          replaceOnlyFirst: true,
        },
        req,
      }),
    ).resolves.toBe('frog bat cat');

    await expect(
      text.replaceText({
        input: {
          text: 'cat bat cat',
          searchValue: '[cb]at',
          replaceValue: 'frog',
          replaceOnlyFirst: false,
        },
        req,
      }),
    ).resolves.toBe('frog frog frog');
  });

  it('finds text and capture groups', async () => {
    await expect(
      text.findText({ input: { text: 'FrogBot 118', expression: '(\\d+)' }, req }),
    ).resolves.toEqual(['118', '118']);

    await expect(
      text.findText({ input: { text: 'FrogBot', expression: 'missing' }, req }),
    ).resolves.toBeNull();
  });

  it('converts Markdown with upstream defaults and validates header bounds', async () => {
    await expect(
      text.convertMarkdownToHtml({ input: { markdown: '# Frog' }, req }),
    ).resolves.toContain('<h1 id="frog">Frog</h1>');

    await expect(
      text.convertMarkdownToHtml({ input: { markdown: '# Frog', headerLevelStart: 7 }, req }),
    ).rejects.toThrow();
  });

  it('converts HTML to Markdown and removes scripts', async () => {
    await expect(
      text.convertHtmlToMarkdown({
        input: {
          html: '<h1>Frog</h1><script>alert(1)</script><strong>Bot</strong>',
        },
        req,
      }),
    ).resolves.toBe('Frog\n====\n\n**Bot**');
  });

  it('strips HTML and slugifies text', async () => {
    await expect(
      text.stripHtml({ input: { html: '<p>Frog <strong>Bot</strong></p>' }, req }),
    ).resolves.toBe('Frog Bot');

    await expect(text.slugifyText({ input: { text: 'Frog Bot & Friends' }, req })).resolves.toBe(
      'Frog-Bot-and-Friends',
    );
  });

  it('uses defaults only for empty strings and lists', async () => {
    await expect(
      text.useDefaultValue({ input: { value: '', defaultValue: 'frog' }, req }),
    ).resolves.toBe('frog');

    await expect(
      text.useDefaultValue({ input: { value: [], defaultValue: 'frog' }, req }),
    ).resolves.toBe('frog');

    await expect(
      text.useDefaultValue({ input: { value: 'bot', defaultValue: 'frog' }, req }),
    ).resolves.toBe('bot');
  });

  it('creates a table from dissimilar object keys', async () => {
    await expect(
      text.createTextTable({
        input: { data: [{ name: 'Frog' }, { name: 'Bot', id: 2 }] },
        req,
      }),
    ).resolves.toBe(
      [
        '+------+----+',
        '| name | id |',
        '+------+----+',
        '| Frog |    |',
        '| Bot  | 2  |',
        '+------+----+',
      ].join('\n'),
    );

    await expect(text.createTextTable({ input: { data: [] }, req })).resolves.toBe('');
  });

  it('rejects table input that is not a list of objects', async () => {
    await expect(text.createTextTable({ input: { data: 'frog' } as never, req })).rejects.toThrow();

    await expect(
      text.createTextTable({ input: { data: ['frog'] } as never, req }),
    ).rejects.toThrow();
  });

  it('extracts predefined and custom HTML targets', async () => {
    const html = '<title>Frog</title><a href="/one">One</a><a href="/two">Two</a>';

    await expect(text.extractFromHtml({ input: { html, target: 'title' }, req })).resolves.toBe(
      'Frog',
    );

    await expect(
      text.extractFromHtml({
        input: {
          html,
          target: 'links',
          extractionType: 'attribute',
          attributeName: 'href',
          returnMultiple: true,
        },
        req,
      }),
    ).resolves.toEqual(['/one', '/two']);

    await expect(
      text.extractFromHtml({
        input: { html, target: 'custom', selector: '.missing' },
        req,
      }),
    ).resolves.toBeNull();
  });

  it('supports each HTML extraction representation', async () => {
    const html = '<p><strong>Frog</strong> Bot</p>';

    await expect(
      text.extractFromHtml({
        input: { html, target: 'paragraphs', extractionType: 'innerHtml' },
        req,
      }),
    ).resolves.toBe('<strong>Frog</strong> Bot');

    await expect(
      text.extractFromHtml({
        input: { html, target: 'paragraphs', extractionType: 'outerHtml' },
        req,
      }),
    ).resolves.toBe('<p><strong>Frog</strong> Bot</p>');
  });

  it('reports incomplete and invalid HTML extraction requests', async () => {
    await expect(
      text.extractFromHtml({ input: { html: '<p>Frog</p>', target: 'custom' }, req }),
    ).rejects.toThrow('Custom CSS Selector');

    await expect(
      text.extractFromHtml({
        input: {
          html: '<p>Frog</p>',
          target: 'paragraphs',
          extractionType: 'attribute',
        },
        req,
      }),
    ).rejects.toThrow('Attribute Name');

    await expect(
      text.extractFromHtml({
        input: { html: '<p>Frog</p>', target: 'custom', selector: '[' },
        req,
      }),
    ).rejects.toThrow('Invalid CSS selector');
  });
});
