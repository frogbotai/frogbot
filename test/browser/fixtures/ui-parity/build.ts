import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Page } from '@playwright/test';
import { build, type Rollup } from 'vite';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, '..', '..', '..', '..');
const ui = path.join(repoRoot, 'packages', 'ui', 'src');

const payloadCss = createRequire(path.join(repoRoot, 'packages', 'next', 'package.json')).resolve(
  '@payloadcms/next/css',
);

/** Payload's admin CSS stack, as `packages/next/src/css.css` loads it. */
export const adminStack = [
  path.join(repoRoot, 'packages', 'next', 'src', 'layers.css'),
  payloadCss,
  path.join(ui, 'styles.css'),
  path.join(ui, 'admin', 'styles.css'),
];

/** What a host without Payload loads. */
export const standaloneStack = [path.join(ui, 'styles.css')];

export const fontsCss = path.join(ui, 'fonts.css');

/** Computed properties compared between the two hosts, per element. */
export const PROPERTIES = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'color',
  'background-color',
  'background-image',
  'border-top-width',
  'border-top-style',
  'border-top-color',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-left-radius',
  'border-bottom-right-radius',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'list-style-type',
  'text-decoration-line',
  'text-align',
  'text-indent',
  'text-transform',
  'white-space',
  'box-sizing',
  'display',
  'position',
  'vertical-align',
  'appearance',
  'outline-style',
  'outline-width',
  'outline-color',
  'outline-offset',
  'content',
  'opacity',
  'resize',
  'cursor',
  'border-collapse',
  'box-shadow',
  'tab-size',
  'font-feature-settings',
  'fill',
  'stroke',
];

const reactRoot = path.join(repoRoot, 'packages', 'ui');

async function bundle(entry: string, files: readonly string[] = [], forbid?: RegExp) {
  const virtual = '\0ui-parity-css.js';
  const output = (await build({
    configFile: false,
    logLevel: 'error',
    root: reactRoot,
    define: { 'process.env.NODE_ENV': '"production"' },
    esbuild: { jsx: 'automatic' },
    resolve: { dedupe: ['react', 'react-dom'] },
    plugins: [
      {
        name: 'ui-parity-css',
        enforce: 'pre',
        resolveId: (id, importer) => {
          if (forbid?.test(id)) throw new Error(`${importer} imports ${id}`);

          return id === virtual ? id : undefined;
        },
        load: (id) =>
          id === virtual
            ? files.map((file) => `import ${JSON.stringify(file)};`).join('\n')
            : undefined,
      },
    ],
    build: {
      write: false,
      minify: false,
      cssMinify: false,
      cssTarget: 'esnext',
      target: 'esnext',
      assetsInlineLimit: Number.MAX_SAFE_INTEGER,
      cssCodeSplit: false,
      rollupOptions: { input: entry === 'css' ? virtual : entry },
    },
  })) as Rollup.RollupOutput;

  const chunk = output.output.find((item) => item.type === 'chunk' && item.isEntry);
  const css = output.output.find((item) => item.type === 'asset' && item.fileName.endsWith('.css'));

  return {
    js: chunk?.type === 'chunk' ? chunk.code : '',
    css: css?.type === 'asset' ? String(css.source) : '',
  };
}

/** Bundles a gallery entry once; `stylesheet()` bundles one CSS stack. */
export async function buildGallery(entry = path.join(dirname, 'gallery.tsx')) {
  return (await bundle(entry)).js;
}

/** Bundles `entry`, failing if anything it imports comes from Payload. */
export async function buildWithoutPayload(entry: string) {
  return (await bundle(entry, [], /^(@payloadcms\/|payload(\/|$))/)).js;
}

export async function stylesheet(files: readonly string[]) {
  return (await bundle('css', files)).css;
}

const still =
  'body { margin: 0; } *, ::before, ::after { animation: none !important; transition: none !important; }';

export type ElementStyle = { key: string; box: string; style: Record<string, string> };

/**
 * Renders the gallery in `page`. `admin` adds the admin page's `html` attributes and the two font
 * variables its root layout sets; both pages get no body margin and no animations.
 */
export async function renderGallery(
  page: Page,
  {
    css,
    js,
    theme,
    admin,
    attributes = '',
  }: { css: string; js: string; theme: 'light' | 'dark'; admin: boolean; attributes?: string },
) {
  const htmlAttributes = admin
    ? ` data-fb-ui-page="" data-theme="${theme}" style="--font-family-sans: Inter; --font-family-mono: 'Roboto Mono', monospace"`
    : '';

  await page.emulateMedia({ reducedMotion: 'reduce' });

  await page.setContent(
    `<!doctype html><html${htmlAttributes} data-gallery-theme="${theme}"${attributes}><head><style>${css}</style><style>${still}</style></head><body><div id="root"></div></body></html>`,
  );

  await page.addScriptTag({ content: js, type: 'module' });

  await page.locator('#g').waitFor();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

const PSEUDO_ELEMENTS = [
  '::before',
  '::after',
  '::marker',
  '::placeholder',
  '::file-selector-button',
];

export function readGallery(page: Page) {
  return page.evaluate(
    ({ properties, pseudoElements }) => {
      const elements = [...document.querySelectorAll('[data-fb-ui], [data-fb-ui] *')];
      const read = (style: CSSStyleDeclaration) =>
        Object.fromEntries(
          properties.map((property) => [property, style.getPropertyValue(property)]),
        );

      return elements.map((element, index) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const className = element.getAttribute('class')?.split(' ')[0] ?? '';
        const pseudo: Record<string, Record<string, string>> = {};
        const field = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;

        const file = element instanceof HTMLInputElement && element.type === 'file';

        for (const name of pseudoElements) {
          if (name === '::placeholder' && !field) continue;
          if (name === '::file-selector-button' && !file) continue;
          if (name === '::marker' && style.display !== 'list-item') continue;

          const pseudoStyle = getComputedStyle(element, name);

          if (
            (name === '::before' || name === '::after') &&
            /^(none|normal)$/.test(pseudoStyle.content)
          ) {
            continue;
          }

          pseudo[name] = read(pseudoStyle);
        }

        return {
          key: `${index}:${element.tagName.toLowerCase()}${className ? `.${className}` : ''}`,
          box: `${rect.x.toFixed(2)},${rect.y.toFixed(2)} ${rect.width.toFixed(2)}x${rect.height.toFixed(2)}`,
          style: {
            ...read(style),
            ...Object.fromEntries(
              Object.entries(pseudo).flatMap(([name, values]) =>
                Object.entries(values).map(([property, value]) => [`${name} ${property}`, value]),
              ),
            ),
          },
        };
      });
    },
    { properties: PROPERTIES, pseudoElements: PSEUDO_ELEMENTS },
  );
}

/** Lines naming each element and property that differs, empty when the two match. */
export function differences(a: readonly ElementStyle[], b: readonly ElementStyle[]) {
  const lines: string[] = [];

  if (a.length !== b.length) lines.push(`element count: ${a.length} | ${b.length}`);

  a.forEach((left, index) => {
    const right = b[index];

    if (!right) return;
    if (left.key !== right.key) lines.push(`${left.key}: element | ${right.key}`);
    if (left.box !== right.box) lines.push(`${left.key} box: ${left.box} | ${right.box}`);

    for (const property of new Set([...Object.keys(left.style), ...Object.keys(right.style)])) {
      if (left.style[property] !== right.style[property]) {
        lines.push(`${left.key} ${property}: ${left.style[property]} | ${right.style[property]}`);
      }
    }
  });

  return lines;
}
