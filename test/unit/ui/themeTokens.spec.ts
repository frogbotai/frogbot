import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

interface CssRule {
  selectors: string[];
  properties: string[];
  media?: string;
}

const root = resolve(import.meta.dirname, '../../..');
const stylesPath = join(root, 'packages/ui/src/styles.css');
const skippedDirectories = new Set(['node_modules', '.next', 'dist']);

const oldTokenPattern = new RegExp(
  [
    '-',
    '-(?:text-(?:xs|sm|base|lg|xl|[2-5]xl)(?:-',
    '-line-height)?|radius(?:-(?:sm|md|lg|xl))?|color-red-(?:500|600|700))\\b',
  ].join(''),
);

const adminOwnedNames = [
  '--font-body',
  '--color-base-0',
  ...Array.from({ length: 20 }, (_, index) => `--color-base-${(index + 1) * 50}`),
  '--color-blue-350',
];

const pageSelector = ':where(html[data-fb-ui-page])';
const darkPageSelector = ':where(html[data-fb-ui-page][data-theme="dark"])';
const lightPortalSelector =
  'html[data-fb-ui-page][data-theme="light"] [data-fb-ui][data-theme="system"]';
const darkPortalSelector =
  'html[data-fb-ui-page][data-theme="dark"] [data-fb-ui][data-theme="system"]';

function listCssFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return skippedDirectories.has(entry.name) ? [] : listCssFiles(path);
    }

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

function parseRules(css: string, media?: string): CssRule[] {
  const rules: CssRule[] = [];
  let index = 0;

  while (css.indexOf('{', index) !== -1) {
    const open = css.indexOf('{', index);
    const close = findClosingBrace(css, open);
    const prelude = css.slice(index, open).split(';').at(-1)!.trim();
    const body = css.slice(open + 1, close);

    index = close + 1;

    if (prelude.startsWith('@media')) {
      rules.push(...parseRules(body, prelude));
      continue;
    }

    if (prelude.startsWith('@')) continue;

    const properties = body
      .split(';')
      .map((declaration) => declaration.split(':')[0].trim())
      .filter(Boolean);

    rules.push({
      selectors: prelude.split(',').map((selector) => selector.replace(/\s+/g, ' ').trim()),
      properties,
      media,
    });
  }

  return rules;
}

function readDeclaredNames(path: string): Set<string> {
  const css = readFileSync(path, 'utf8');

  return new Set(Array.from(css.matchAll(/(--[\w-]+)\s*:/g), (match) => match[1]));
}

function resolveFrom(packageDirectory: string, specifier: string): string {
  return createRequire(join(root, packageDirectory, 'package.json')).resolve(specifier);
}

const rules = parseRules(readFileSync(stylesPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''));
const adminNames = readDeclaredNames(resolveFrom('packages/next', '@payloadcms/next/css'));
const tailwindNames = readDeclaredNames(resolveFrom('examples/tailwind', 'tailwindcss/theme.css'));

function findRule(selector: string): CssRule {
  const rule = rules.find((candidate) => candidate.selectors.includes(selector));

  if (!rule) throw new Error(`No rule for ${selector}`);

  return rule;
}

describe('FrogBot theme tokens', () => {
  it('no CSS file uses a Tailwind-named FrogBot token', () => {
    const files = ['packages/ui/src', 'packages/next/src', 'templates', 'examples', 'test'].flatMap(
      (directory) => listCssFiles(join(root, directory)),
    );

    const offenders = files.filter((file) => oldTokenPattern.test(readFileSync(file, 'utf8')));

    expect(files.length).toBeGreaterThan(50);
    expect(offenders).toEqual([]);
  });

  it('declares no custom property that Tailwind also declares', () => {
    const shared = [...readDeclaredNames(stylesPath)].filter((name) => tailwindNames.has(name));

    expect(tailwindNames.size).toBeGreaterThan(100);
    expect(shared).toEqual([]);
  });

  it('page-level rules declare no admin or Tailwind custom property', () => {
    const pageRules = rules.filter((rule) =>
      rule.selectors.some((selector) => selector.includes('data-fb-ui-page')),
    );

    const clashes = pageRules
      .flatMap((rule) => rule.properties)
      .filter((name) => adminNames.has(name) || tailwindNames.has(name));

    expect(adminNames.has('--color-base-0')).toBe(true);
    expect(pageRules.length).toBeGreaterThan(0);
    expect(clashes).toEqual([]);
  });

  it('page-level rules on the html element declare only custom properties', () => {
    const properties = [findRule(pageSelector), findRule(darkPageSelector)].flatMap(
      (rule) => rule.properties,
    );

    expect(properties.filter((name) => !name.startsWith('--'))).toEqual([]);
  });

  it('keeps admin-owned names, font-family, and color inside the wrapper rule', () => {
    const wrapperOnly = [...adminOwnedNames, 'font-family', 'color'];

    const declaring = rules.filter((rule) =>
      rule.properties.some((name) => wrapperOnly.includes(name)),
    );

    expect(adminOwnedNames.every((name) => adminNames.has(name))).toBe(true);
    expect(declaring).toHaveLength(1);
    expect(declaring[0].selectors).toEqual(['[data-fb-ui]']);
    expect(declaring[0].media).toBeUndefined();
    expect([...declaring[0].properties].sort()).toEqual([...wrapperOnly].sort());
  });

  it('applies the shared light tokens to the page, light admin portals, and the wrapper', () => {
    expect(findRule(pageSelector).selectors).toEqual([
      pageSelector,
      lightPortalSelector,
      '[data-fb-ui]',
    ]);
  });

  it('applies the dark tokens to the page and dark admin portals', () => {
    expect(findRule(darkPageSelector).selectors).toEqual(
      expect.arrayContaining([darkPageSelector, darkPortalSelector]),
    );
  });

  it('declares the dark page rule after the light page rule', () => {
    const lightIndex = rules.indexOf(findRule(pageSelector));
    const darkIndex = rules.indexOf(findRule(darkPageSelector));

    expect(darkIndex).toBeGreaterThan(lightIndex);
  });

  it('sets color-scheme for admin portals in both themes', () => {
    const schemeRules = rules.filter((rule) => rule.properties.includes('color-scheme'));

    const schemeSelectors = schemeRules.flatMap((rule) => rule.selectors);

    expect(schemeSelectors).toEqual(
      expect.arrayContaining([lightPortalSelector, darkPortalSelector]),
    );
  });
});
