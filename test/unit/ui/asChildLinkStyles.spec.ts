import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

interface CssRule {
  selectors: string[];
  declarations: Map<string, string>;
}

const root = resolve(import.meta.dirname, '../../..');
const uiSource = join(root, 'packages/ui/src');

const baseRules = [
  { file: 'components/button.css', selector: '.fb-button', inheritsColor: true },
  {
    file: 'components/dropdown-menu.css',
    selector: '.fb-dropdown-menu__item',
    inheritsColor: true,
  },
  { file: 'components/context-menu.css', selector: '.fb-context-menu__item', inheritsColor: true },
  { file: 'components/tabs.css', selector: '.fb-tabs__trigger', inheritsColor: true },
  { file: 'components/toggle.css', selector: '.fb-toggle', inheritsColor: false },
  { file: 'components/accordion.css', selector: '.fb-accordion__trigger', inheritsColor: false },
  { file: 'chat/file-part.css', selector: '.fb-file-part--download', inheritsColor: false },
];

const ownColors = [
  { file: 'components/accordion.css', selector: '.fb-accordion__trigger', color: 'inherit' },
  { file: 'components/toggle.css', selector: '.fb-toggle', color: 'var(--theme-base-600)' },
  {
    file: 'chat/file-part.css',
    selector: '.fb-file-part--download',
    color: 'var(--theme-base-850)',
  },
];

const anchorSelectorPattern = /(^|[\s>+~(])a(?=$|[\s.:#[>+~)])|:any-link|:link|:visited/;

function listCssFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) return listCssFiles(path);

    return entry.name.endsWith('.css') ? [path] : [];
  });
}

function findClosingBrace(css: string, open: number): number {
  let depth = 0;

  for (let index = open; index < css.length; index++) {
    if (css[index] === '{') depth++;

    if (css[index] === '}') depth--;

    if (depth === 0) return index;
  }

  throw new Error(`Unclosed block at ${open}`);
}

function parseDeclarations(body: string): Map<string, string> {
  const entries = body
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .map((declaration) => {
      const colon = declaration.indexOf(':');

      return [declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim()] as const;
    });

  return new Map(entries);
}

function parseRules(css: string): CssRule[] {
  const rules: CssRule[] = [];
  let index = 0;

  while (css.indexOf('{', index) !== -1) {
    const open = css.indexOf('{', index);
    const close = findClosingBrace(css, open);
    const prelude = css.slice(index, open).split(';').at(-1)!.trim();
    const body = css.slice(open + 1, close);

    index = close + 1;

    if (prelude.startsWith('@media') || prelude.startsWith('@supports')) {
      rules.push(...parseRules(body));
      continue;
    }

    if (prelude.startsWith('@')) continue;

    rules.push({
      selectors: prelude.split(',').map((selector) => selector.replace(/\s+/g, ' ').trim()),
      declarations: parseDeclarations(body),
    });
  }

  return rules;
}

function readRules(path: string): CssRule[] {
  return parseRules(readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''));
}

function findRule(file: string, selectors: string[]): CssRule {
  const rule = readRules(join(uiSource, file)).find(
    (candidate) => candidate.selectors.join(',') === selectors.join(','),
  );

  if (!rule) throw new Error(`No rule for ${selectors.join(', ')} in ${file}`);

  return rule;
}

describe('asChild link styles', () => {
  it.each(baseRules)('$selector sets text-decoration: none', ({ file, selector }) => {
    const rule = findRule(file, [selector]);

    expect(rule.declarations.get('text-decoration')).toBe('none');
  });

  it.each(baseRules.filter((rule) => rule.inheritsColor))(
    '$selector sets color: inherit',
    ({ file, selector }) => {
      const rule = findRule(file, [selector]);

      expect(rule.declarations.get('color')).toBe('inherit');
    },
  );

  it('.fb-accordion__trigger, .fb-toggle, and .fb-file-part--download keep their own resting color', () => {
    const colors = ownColors.map(({ file, selector }) =>
      findRule(file, [selector]).declarations.get('color'),
    );

    expect(colors).toEqual(ownColors.map(({ color }) => color));
  });

  it('.fb-button--link:hover still sets text-decoration-line: underline', () => {
    const rule = findRule('components/button.css', ['.fb-button--link:hover']);

    expect(rule.declarations.get('text-decoration-line')).toBe('underline');
  });

  it('no @frogbotai/ui stylesheet targets bare anchors', () => {
    const files = listCssFiles(uiSource);

    const offenders = files.flatMap((file) =>
      readRules(file)
        .flatMap((rule) => rule.selectors)
        .filter((selector) => anchorSelectorPattern.test(selector))
        .map((selector) => `${file}: ${selector}`),
    );

    expect(files.length).toBeGreaterThan(20);
    expect(offenders).toEqual([]);
  });
});
