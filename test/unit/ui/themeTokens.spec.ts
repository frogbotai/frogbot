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

const resetPath = join(root, 'packages/ui/src/reset.css');

const oldTokenPattern = new RegExp(
  [
    '-',
    '-(?:text-(?:xs|sm|base|lg|xl|[2-5]xl)(?:-',
    '-line-height)?|radius(?:-(?:sm|md|lg|xl))?|color-red-(?:500|600|700))(?![\\w-])',
  ].join(''),
);

const pageSelector = ':where(html:not([data-fb-ui-page]))';
const payloadTokensPath = join(root, 'packages/ui/src/payload-tokens.css');
const brandColorsPath = join(root, 'packages/ui/src/brand-colors.css');

const removedTokenPattern = new RegExp(
  [
    /--fb-(?:base|theme|color|option-pill)-[\w-]+/,
    /--fb-code-block-user-background/,
    /--font-payload/,
    /--color-brand-[\w-]+/,
    /--color-(?:green|purple|orange)-350/,
    /(?<![\w-])--(?:color-)?(?:background|foreground|card|popover|primary|secondary|muted|accent|destructive|success|warning|input|ring|sidebar)(?:-[\w-]+)?(?![\w-])/,
    /(?<![\w-])--border(?:-hover)?(?![\w-])/,
  ]
    .map((pattern) => pattern.source)
    .join('|'),
);

function listCssFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return skippedDirectories.has(entry.name) ? [] : listCssFiles(path);
    }

    return entry.name.endsWith('.css') ? [path] : [];
  });
}

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return skippedDirectories.has(entry.name) ? [] : listSourceFiles(path);
    }

    return /\.(?:css|tsx?)$/.test(entry.name) ? [path] : [];
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

  return new Set(Array.from(css.matchAll(/(?:^|[{;\s])(--[\w-]+)\s*:/g), (match) => match[1]));
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
  it('puts every UI, admin and plugin rule in the frogbot layer or theme.frogbot, the reset aside', () => {
    const offenders = frogbotCssFiles.flatMap((file) =>
      readTopLevelBlocks(file)
        .filter((prelude) => !frogbotLayers.includes(prelude))
        .filter((prelude) => file !== resetPath || prelude !== '@layer frogbot-reset')
        .map((prelude) => `${relative(root, file)}: ${prelude}`),
    );

    expect(frogbotCssFiles.length).toBeGreaterThan(75);
    expect(offenders).toEqual([]);
  });

  it('keeps the reset in its own layer, in reset.css only', () => {
    expect(readTopLevelBlocks(resetPath)).toEqual(['@layer frogbot-reset']);
    expect(readImports(stylesPath).slice(0, 4)).toEqual([
      layerOrderFiles[0],
      payloadTokensPath,
      brandColorsPath,
      resetPath,
    ]);
  });

  it('declares the layer order only in the layers.css files', () => {
    const offenders = frogbotCssFiles.filter((file) =>
      /@layer [^{;]*;/.test(stripComments(readFileSync(file, 'utf8'))),
    );

    expect(offenders).toEqual([]);
  });

  it('declares the Tailwind order in the UI and the admin order before the admin styles', () => {
    expect(readFileSync(layerOrderFiles[0], 'utf8').trim()).toBe(
      '@layer frogbot-reset, theme, base, components, frogbot, utilities;',
    );
    expect(readFileSync(layerOrderFiles[1], 'utf8').trim()).toBe(
      '@layer frogbot-reset, payload-default, frogbot, payload;',
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

  it("declares or reads none of FrogBot's former color tokens", () => {
    const files = [
      'packages/ui/src',
      'packages/next/src',
      ...readdirSync(join(root, 'packages/plugins')).map((name) => `packages/plugins/${name}/src`),
    ].flatMap((directory) => listSourceFiles(join(root, directory)));

    const offenders = files.flatMap((file) =>
      Array.from(
        stripComments(readFileSync(file, 'utf8')).matchAll(new RegExp(removedTokenPattern, 'g')),
        ([name]) => name,
      )
        .filter((name) => !adminNames.has(name))
        .map((name) => `${relative(root, file)}: ${name}`),
    );

    expect(files.length).toBeGreaterThan(500);
    expect(offenders).toEqual([]);
  });

  it('uses no light-dark() in any package stylesheet', () => {
    const files = readdirSync(join(root, 'packages')).flatMap((name) =>
      listCssFiles(join(root, 'packages', name)),
    );

    const offenders = files.filter((file) =>
      /light-dark\(/.test(stripComments(readFileSync(file, 'utf8'))),
    );

    expect(files.length).toBeGreaterThan(75);
    expect(offenders.map((file) => relative(root, file))).toEqual([]);
  });

  it('declares color tokens only in payload-tokens.css and brand tokens in brand-colors.css', () => {
    const payloadNames = readDeclaredNames(payloadTokensPath);
    const colorName = (name: string) =>
      payloadNames.has(name) || /^--(?:color|ramp|elevation|special|field-color)-/.test(name);

    const offenders = frogbotCssFiles
      .filter((file) => file !== payloadTokensPath)
      .flatMap((file) =>
        [...readDeclaredNames(file)]
          .filter(colorName)
          .filter(
            (name) => file !== brandColorsPath || !/brand/.test(name) || !adminNames.has(name),
          )
          .map((name) => `${relative(root, file)}: ${name}`),
      );

    expect(payloadNames.has('--color-bg')).toBe(true);
    expect([...payloadNames].filter((name) => !adminNames.has(name))).toEqual([]);
    expect(offenders).toEqual([]);
  });

  it("sets FrogBot's brand on Payload's own brand tokens, light and dark", () => {
    const rules = parseRules(stripComments(readFileSync(brandColorsPath, 'utf8')));
    const page = rules.find((rule) => rule.selectors.join() === ':root');
    const light = rules.find((rule) => rule.selectors.includes('[data-theme="light"]'));
    const dark = rules.find((rule) => rule.selectors.includes('[data-theme="dark"]'));

    expect(rules.every((rule) => rule.layer === 'theme.frogbot')).toBe(true);
    expect(light?.selectors).toEqual([':root', '[data-theme="light"]']);
    expect(page?.declarations.get('--color-bg-brand')).toBe('#2f964f');
    expect([...(light?.declarations.keys() ?? [])].sort()).toEqual(
      [...(dark?.declarations.keys() ?? [])].sort(),
    );
    expect(dark?.declarations.get('--color-text-brand')).toBe('#67c285');
    expect([...readDeclaredNames(brandColorsPath)].filter((name) => !/brand/.test(name))).toEqual(
      [],
    );
  });

  it('declares the Payload tokens outside the admin only, the light section aside', () => {
    const tokenRules = parseRules(stripComments(readFileSync(payloadTokensPath, 'utf8')));

    expect(tokenRules.map(({ layer, selectors }) => ({ layer, selectors }))).toEqual([
      { layer: 'theme.frogbot', selectors: [pageSelector] },
      { layer: 'theme.frogbot', selectors: [':where(:not(html)[data-theme="light"])'] },
      {
        layer: 'theme.frogbot',
        selectors: [
          ':where( html:not([data-fb-ui-page])[data-theme="dark"]',
          'html:not([data-fb-ui-page]) [data-theme="dark"] )',
        ],
      },
    ]);
  });

  it('declares no custom property that Tailwind also declares', () => {
    const shared = [...readDeclaredNames(stylesPath)].filter((name) => tailwindNames.has(name));

    expect(tailwindNames.size).toBeGreaterThan(100);
    expect(shared).toEqual([]);
  });

  it('defines its own tokens once, on the page, in theme.frogbot', () => {
    const tokenRules = rules.filter((rule) =>
      rule.properties.some((name) => name.startsWith('--')),
    );

    expect(tokenRules.map(({ layer, media, selectors }) => ({ layer, media, selectors }))).toEqual([
      { layer: 'theme.frogbot', media: undefined, selectors: [':root'] },
      { layer: 'theme.frogbot', media: undefined, selectors: [pageSelector] },
    ]);
  });

  it('declares no token on a FrogBot wrapper', () => {
    const wrapperTokens = [stylesPath, payloadTokensPath]
      .flatMap((file) => parseRules(stripComments(readFileSync(file, 'utf8'))))
      .filter((rule) => rule.selectors.some((selector) => /\[data-fb-ui[\]\s]/.test(selector)))
      .flatMap((rule) => rule.properties.filter((name) => name.startsWith('--')));

    expect(wrapperTokens).toEqual([]);
  });

  it("page-level tokens declare no admin or Tailwind custom property but the admin's body text size", () => {
    const clashes = findRule(':root').properties.filter(
      (name) =>
        (adminNames.has(name) && !name.startsWith('--text-body-medium-')) ||
        tailwindNames.has(name),
    );

    expect(adminNames.has('--color-border')).toBe(true);
    expect(clashes).toEqual([]);
  });

  it("supplies the admin's body font only outside the admin", () => {
    expect(adminNames.has('--font-body')).toBe(true);
    expect(findRule(pageSelector).properties).toEqual(['--font-body']);
  });

  it("leaves the root font size alone and raises the admin's body text to 14px", () => {
    const files = [
      ...new Set([...frogbotCssFiles, ...listCssFiles(join(root, 'packages/ui/src'))]),
    ];

    const rootFontSizes = files.flatMap((file) =>
      parseRules(stripComments(readFileSync(file, 'utf8')))
        .filter((rule) => rule.selectors.some((selector) => /^(?:html|:root)$/.test(selector)))
        .filter((rule) => rule.properties.includes('font-size'))
        .map(() => relative(root, file)),
    );

    const page = parseRules(stripComments(readFileSync(stylesPath, 'utf8'))).find(
      (rule) => rule.layer === 'theme.frogbot' && rule.selectors.includes(':root'),
    );

    expect(rootFontSizes).toEqual([]);
    expect(adminNames.has('--text-body-medium-font-size')).toBe(true);
    expect(page?.declarations.get('--text-body-medium-font-size')).toBe('0.875rem');
    expect(page?.declarations.get('--text-body-medium-bold-font-size')).toBe('0.875rem');
  });

  it('keeps font-family and color on the wrapper rule only', () => {
    const declaring = rules.filter((rule) =>
      rule.properties.some((name) => ['font-family', 'color'].includes(name)),
    );

    expect(declaring).toHaveLength(1);
    expect(declaring[0].selectors).toEqual(['[data-fb-ui]']);
    expect(declaring[0].layer).toBe('frogbot');
    expect([...declaring[0].properties].sort()).toEqual(['color', 'font-family']);
    expect(declaring[0].declarations.get('color')).toBe('var(--color-text)');
  });

  it('sets color-scheme from the resolved data-theme on the page and on themed sections', () => {
    const schemes = new Map(
      rules
        .filter((rule) => rule.properties.includes('color-scheme'))
        .flatMap((rule) =>
          rule.selectors.map((selector) => [selector, rule.declarations.get('color-scheme')]),
        ),
    );

    expect(Object.fromEntries(schemes)).toEqual({
      [`${pageSelector}[data-theme="light"]`]: 'light',
      [`${pageSelector}[data-theme="dark"]`]: 'dark',
      '[data-fb-ui][data-theme="light"]': 'light',
      '[data-fb-ui][data-theme="dark"]': 'dark',
    });
  });
});
