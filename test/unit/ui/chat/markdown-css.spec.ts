import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../../..');
const read = (path: string) => readFileSync(join(root, 'packages/ui/src/chat', path), 'utf8');
const css = read('markdown.css');

const parse = (source: string) =>
  [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, body]) => ({
    selectors: selectors
      .split(',')
      .map((selector) => selector.trim())
      .filter(Boolean),
    declarations: new Map(
      body
        .split(';')
        .map((declaration) => declaration.split(':').map((part) => part.trim()))
        .filter(([property, value]) => property && value)
        .map(([property, value]): [string, string] => [property, value]),
    ),
  }));

const rules = parse(css);

const declaration = (selector: string, property: string, from = rules) =>
  from
    .filter((rule) => rule.selectors.includes(selector) && rule.declarations.has(property))
    .map((rule) => rule.declarations.get(property));

describe('markdown.css', () => {
  it('is one @layer frogbot block', () => {
    expect(css.trim()).toMatch(/^@layer frogbot \{[\s\S]*\}$/);
    expect(css.match(/@layer/g)).toHaveLength(1);
  });

  it.each([
    '.fb-markdown__paragraph',
    '.fb-markdown__ordered-list',
    '.fb-markdown__unordered-list',
    '.fb-markdown__list-item',
  ])('sets message %s to the 14px token at 160%%', (className) => {
    const selector = `.fb-message ${className}`;

    expect(declaration(selector, 'font-size')).toEqual(['var(--fb-text-sm)']);
    expect(declaration(selector, 'line-height')).toEqual(['160%']);
  });

  it.each([
    ['.fb-markdown__heading-1', '1.0625rem'],
    ['.fb-markdown__heading-2', '0.9375rem'],
    ['.fb-markdown__heading-3', '0.8125rem'],
    ['.fb-markdown__heading-4', '0.8125rem'],
    ['.fb-markdown__heading-5', '0.8125rem'],
    ['.fb-markdown__heading-6', '0.8125rem'],
  ])('sets message %s to %s', (className, size) => {
    const selector = `.fb-message ${className}`;

    expect(declaration(selector, 'font-size')).toEqual([size]);
    expect(declaration(selector, 'line-height')).toEqual(['150%']);
  });

  it('sets message inline code to 13px on the body line height', () => {
    const selector = '.fb-message .fb-markdown__inline-code';

    expect(declaration(selector, 'font-size')).toEqual(['0.8125rem']);
    expect(declaration(selector, 'line-height')).toEqual(['inherit']);
  });

  it('keeps the unscoped Markdown sizes', () => {
    expect(declaration('.fb-markdown__paragraph', 'font-size')).toEqual(['1rem']);
    expect(declaration('.fb-markdown__heading-1', 'font-size')).toEqual(['2rem']);
    expect(declaration('.fb-markdown__inline-code', 'font-size')).toEqual(['0.875rem']);
  });

  it('scopes no font rule to assistant messages only', () => {
    expect(css).not.toContain('.fb-message--assistant');
  });

  it.each([
    ['message-editor.css', '.fb-message-editor__input'],
    ['composer/composer.css', '.fb-composer__input'],
    ['composer/composer.css', '.fb-composer-editor__placeholder'],
  ])('sets %s %s to the 14px token', (path, selector) => {
    const source = parse(read(path));

    expect(declaration(selector, 'font-size', source)).toEqual(['var(--fb-text-sm)']);
    expect(declaration(selector, 'line-height', source)).toEqual([
      'var(--fb-text-sm--line-height)',
    ]);
  });
});
