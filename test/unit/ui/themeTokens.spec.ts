import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

interface CssRule {
  selectors: string[];
  properties: string[];
  declarations: Map<string, string>;
  layer?: string;
  media?: string;
}

interface CssContext {
  layer?: string;
  media?: string;
}

const root = resolve(import.meta.dirname, '../../..');
const stylesPath = join(root, 'packages/ui/src/styles.css');
const skippedDirectories = new Set(['node_modules', '.next', 'dist']);
const frogbotLayers = ['@layer frogbot', '@layer theme.frogbot'];
const layerOrderFiles = [
  join(root, 'packages/ui/src/layers.css'),
  join(root, 'packages/next/src/layers.css'),
];

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

const paletteSelector = ':where(html:not([data-fb-ui-page]))';
const lightPortalSelector =
  'html[data-fb-ui-page][data-theme="light"] [data-fb-ui][data-theme="system"]';
const darkPortalSelector =
  'html[data-fb-ui-page][data-theme="dark"] [data-fb-ui][data-theme="system"]';

const baseSteps = [0, ...Array.from({ length: 20 }, (_, index) => (index + 1) * 50)];

const formerTriplets = [
  '--card',
  '--card-foreground',
  '--popover-foreground',
  '--ring',
  '--sidebar-foreground',
  '--sidebar-primary',
  '--sidebar-primary-foreground',
  '--sidebar-accent-foreground',
  '--sidebar-border',
];

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

function parseRules(css: string, context: CssContext = {}): CssRule[] {
  const rules: CssRule[] = [];
  let index = 0;

  while (css.indexOf('{', index) !== -1) {
    const open = css.indexOf('{', index);
    const close = findClosingBrace(css, open);
    const prelude = css.slice(index, open).split(';').at(-1)!.trim();
    const body = css.slice(open + 1, close);

    index = close + 1;

    if (prelude.startsWith('@media')) {
      rules.push(...parseRules(body, { ...context, media: prelude }));
      continue;
    }

    if (prelude.startsWith('@layer')) {
      const name = prelude.slice('@layer'.length).trim();
      const layer = context.layer ? `${context.layer}.${name}` : name;

      rules.push(...parseRules(body, { ...context, layer }));
      continue;
    }

    if (prelude.startsWith('@')) continue;

    const declarations = new Map(
      body
        .split(';')
        .map((declaration) => declaration.trim())
        .filter(Boolean)
        .map((declaration) => {
          const colon = declaration.indexOf(':');

          return [
            declaration.slice(0, colon).trim(),
            declaration
              .slice(colon + 1)
              .replace(/\s+/g, ' ')
              .trim(),
          ] as const;
        }),
    );

    rules.push({
      selectors: prelude.split(',').map((selector) => selector.replace(/\s+/g, ' ').trim()),
      properties: [...declarations.keys()],
      declarations,
      ...context,
    });
  }

  return rules;
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function readTopLevelBlocks(path: string): string[] {
  const css = stripComments(readFileSync(path, 'utf8'));
  const preludes: string[] = [];
  let index = 0;

  while (css.indexOf('{', index) !== -1) {
    const open = css.indexOf('{', index);

    preludes.push(css.slice(index, open).split(';').at(-1)!.trim());
    index = findClosingBrace(css, open) + 1;
  }

  return preludes;
}

function readImports(path: string): string[] {
  const css = readFileSync(path, 'utf8');

  return Array.from(css.matchAll(/@import "(\.[^"]+)";/g), (match) =>
    join(dirname(path), match[1]),
  );
}

function readDeclaredNames(path: string): Set<string> {
  const css = readFileSync(path, 'utf8');

  return new Set(Array.from(css.matchAll(/(--[\w-]+)\s*:/g), (match) => match[1]));
}

function resolveFrom(packageDirectory: string, specifier: string): string {
  return createRequire(join(root, packageDirectory, 'package.json')).resolve(specifier);
}

const rules = parseRules(stripComments(readFileSync(stylesPath, 'utf8')));
const adminNames = readDeclaredNames(resolveFrom('packages/next', '@payloadcms/next/css'));
const tailwindNames = readDeclaredNames(resolveFrom('examples/tailwind', 'tailwindcss/theme.css'));

function findRule(selector: string): CssRule {
  const rule = rules.find((candidate) => candidate.selectors.includes(selector));

  if (!rule) throw new Error(`No rule for ${selector}`);

  return rule;
}

const frogbotCssFiles = [
  stylesPath,
  ...readImports(stylesPath).filter((path) => !layerOrderFiles.includes(path)),
  ...[
    'packages/next/src',
    'packages/plugins/plugin-api-keys/src/client',
    'packages/plugins/plugin-usage-reports/src/client',
  ]
    .flatMap((directory) => listCssFiles(join(root, directory)))
    .filter((path) => !layerOrderFiles.includes(path)),
];

describe('FrogBot cascade layers', () => {
  it('puts every UI, admin and plugin rule in the frogbot layer or theme.frogbot', () => {
    const offenders = frogbotCssFiles.flatMap((file) =>
      readTopLevelBlocks(file)
        .filter((prelude) => !frogbotLayers.includes(prelude))
        .map((prelude) => `${relative(root, file)}: ${prelude}`),
    );

    expect(frogbotCssFiles.length).toBeGreaterThan(75);
    expect(offenders).toEqual([]);
  });

  it('declares the layer order only in the layers.css files', () => {
    const offenders = frogbotCssFiles.filter((file) =>
      /@layer [^{;]*;/.test(stripComments(readFileSync(file, 'utf8'))),
    );

    expect(offenders).toEqual([]);
  });

  it('declares the Tailwind order in the UI and the admin order before the admin styles', () => {
    expect(readFileSync(layerOrderFiles[0], 'utf8').trim()).toBe(
      '@layer theme, base, components, frogbot, utilities;',
    );
    expect(readFileSync(layerOrderFiles[1], 'utf8').trim()).toBe(
      '@layer payload-default, frogbot, payload;',
    );
    expect(readImports(stylesPath)[0]).toBe(layerOrderFiles[0]);
    expect(readFileSync(join(root, 'packages/next/src/css.css'), 'utf8')).toMatch(
      /^@import "\.\/layers\.css";\n@import "@payloadcms\/next\/css";/,
    );
  });
});

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

  it('defines the tokens once, on the page, in theme.frogbot', () => {
    const tokenRules = rules.filter((rule) =>
      rule.properties.some((name) => name.startsWith('--')),
    );

    expect(tokenRules.map(({ layer, media, selectors }) => ({ layer, media, selectors }))).toEqual([
      { layer: 'theme.frogbot', media: undefined, selectors: [':root'] },
      { layer: 'theme.frogbot', media: undefined, selectors: [paletteSelector] },
    ]);
  });

  it('declares no token on a FrogBot wrapper', () => {
    const wrapperTokens = rules
      .filter((rule) => rule.selectors.some((selector) => /\[data-fb-ui[\]\s]/.test(selector)))
      .flatMap((rule) => rule.properties.filter((name) => name.startsWith('--')));

    expect(wrapperTokens).toEqual([]);
  });

  it('page-level tokens declare no admin or Tailwind custom property', () => {
    const clashes = findRule(':root').properties.filter(
      (name) => adminNames.has(name) || tailwindNames.has(name),
    );

    expect(adminNames.has('--color-base-0')).toBe(true);
    expect(clashes).toEqual([]);
  });

  it('declares the admin-owned palette names only outside the admin', () => {
    const palette = findRule(paletteSelector);

    expect(adminOwnedNames.every((name) => adminNames.has(name))).toBe(true);
    expect([...palette.properties].sort()).toEqual(
      adminOwnedNames.filter((name) => name !== '--color-blue-350').sort(),
    );
    expect(rules.some((rule) => rule.properties.includes('--color-blue-350'))).toBe(false);
  });

  it('keeps font-family and color on the wrapper rule only', () => {
    const declaring = rules.filter((rule) =>
      rule.properties.some((name) => ['font-family', 'color'].includes(name)),
    );

    expect(declaring).toHaveLength(1);
    expect(declaring[0].selectors).toEqual(['[data-fb-ui]']);
    expect(declaring[0].layer).toBe('frogbot');
    expect([...declaring[0].properties].sort()).toEqual(['color', 'font-family']);
  });

  it('inverts the neutral scale with light-dark()', () => {
    const tokens = findRule(':root').declarations;

    const values = baseSteps.map((step) => tokens.get(`--theme-base-${step}`));

    expect(values).toEqual(
      baseSteps.map((step) =>
        step === 500
          ? 'var(--color-base-500)'
          : `light-dark(var(--color-base-${step}), var(--color-base-${1000 - step}))`,
      ),
    );
  });

  it('turns the mode-dependent HSL triplets into full light-dark() colors', () => {
    const tokens = findRule(':root').declarations;

    const values = formerTriplets.map((name) => tokens.get(name));

    expect(values.every((value) => value?.startsWith('light-dark(hsl('))).toBe(true);
    expect(tokens.get('--color-card')).toBe('var(--card)');
    expect(tokens.get('--color-ring')).toBe('var(--ring)');
  });

  it('sets color-scheme for light, dark, and system wrappers and admin portals', () => {
    const schemes = new Map(
      rules
        .filter((rule) => rule.properties.includes('color-scheme'))
        .flatMap((rule) =>
          rule.selectors.map((selector) => [selector, rule.declarations.get('color-scheme')]),
        ),
    );

    expect(schemes.get('[data-fb-ui][data-theme="system"]')).toBe('light dark');
    expect(schemes.get('[data-fb-ui][data-theme="light"]')).toBe('light');
    expect(schemes.get('[data-fb-ui][data-theme="dark"]')).toBe('dark');
    expect(schemes.get('[data-fb-ui].dark')).toBe('dark');
    expect(schemes.get(lightPortalSelector)).toBe('light');
    expect(schemes.get(darkPortalSelector)).toBe('dark');
    expect(schemes.get('[data-fb-theme="light"] [data-fb-ui][data-theme="system"]')).toBe('light');
    expect(schemes.get('[data-fb-theme="dark"] [data-fb-ui][data-theme="system"]')).toBe('dark');
  });
});
