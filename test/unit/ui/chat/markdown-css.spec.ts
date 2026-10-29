import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../../..');
const css = readFileSync(join(root, 'packages/ui/src/chat/markdown.css'), 'utf8');

const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, body]) => ({
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

const declaration = (selector: string, property: string) =>
  rules
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
  ])('sets assistant %s to 14px at 160%%', (className) => {
    const selector = `.fb-message--assistant ${className}`;

    expect(declaration(selector, 'font-size')).toEqual(['0.875rem']);
    expect(declaration(selector, 'line-height')).toEqual(['160%']);
  });

  it.each([
    ['.fb-markdown__heading-1', '1.0625rem'],
    ['.fb-markdown__heading-2', '0.9375rem'],
    ['.fb-markdown__heading-3', '0.8125rem'],
    ['.fb-markdown__heading-4', '0.8125rem'],
    ['.fb-markdown__heading-5', '0.8125rem'],
    ['.fb-markdown__heading-6', '0.8125rem'],
  ])('sets assistant %s to %s', (className, size) => {
    const selector = `.fb-message--assistant ${className}`;

    expect(declaration(selector, 'font-size')).toEqual([size]);
    expect(declaration(selector, 'line-height')).toEqual(['150%']);
  });

  it('sets assistant inline code to 13px on the body line height', () => {
    const selector = '.fb-message--assistant .fb-markdown__inline-code';

    expect(declaration(selector, 'font-size')).toEqual(['0.8125rem']);
    expect(declaration(selector, 'line-height')).toEqual(['inherit']);
  });

  it('keeps the unscoped Markdown sizes', () => {
    expect(declaration('.fb-markdown__paragraph', 'font-size')).toEqual(['1rem']);
    expect(declaration('.fb-markdown__heading-1', 'font-size')).toEqual(['2rem']);
    expect(declaration('.fb-markdown__inline-code', 'font-size')).toEqual(['0.875rem']);
  });
});
