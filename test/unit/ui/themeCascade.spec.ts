import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

interface Declaration {
  file: string;
  layer?: string;
  selectors: string[];
  name: string;
  value: string;
}

const root = resolve(import.meta.dirname, '../../..');
const uiSrc = join(root, 'packages/ui/src');
const stylesPath = join(uiSrc, 'styles.css');
const themePath = join(uiSrc, 'theme.css');
const payloadTokensPath = join(uiSrc, 'payload-tokens.css');

function stripComments(css: string) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function closingBrace(css: string, open: number) {
  let depth = 0;

  for (let index = open; index < css.length; index++) {
    if (css[index] === '{') depth++;
    if (css[index] === '}') depth--;
    if (depth === 0) return index;
  }

  throw new Error(`Unclosed block at ${open}`);
}

function declarations(file: string, css: string, layer?: string): Declaration[] {
  const found: Declaration[] = [];
  let index = 0;

  while (css.indexOf('{', index) !== -1) {
    const open = css.indexOf('{', index);
    const close = closingBrace(css, open);
    const prelude = css.slice(index, open).split(';').at(-1)!.trim();
    const body = css.slice(open + 1, close);

    index = close + 1;

    if (prelude.startsWith('@layer')) {
      const name = prelude.slice('@layer'.length).trim();

      found.push(...declarations(file, body, layer ? `${layer}.${name}` : name));
      continue;
    }

    if (prelude.startsWith('@media')) {
      found.push(...declarations(file, body, layer));
      continue;
    }

    if (prelude.startsWith('@')) continue;

    const selectors = prelude.split(',').map((selector) => selector.replace(/\s+/g, ' ').trim());

    for (const part of body.split(';')) {
      const colon = part.indexOf(':');
      const name = part.slice(0, colon).trim();

      if (colon === -1 || !name.startsWith('--')) continue;

      found.push({
        file,
        layer,
        selectors,
        name,
        value: part
          .slice(colon + 1)
          .replace(/\s+/g, ' ')
          .trim(),
      });
    }
  }

  return found;
}

function cascadeOrder(path: string): Declaration[] {
  const css = stripComments(readFileSync(path, 'utf8'));
  const imports = Array.from(css.matchAll(/@import "(\.[^"]+)";/g), (match) =>
    join(dirname(path), match[1]),
  );

  const own = css.replace(/@import "[^"]+";/g, '');

  return [...imports.flatMap(cascadeOrder), ...declarations(path, own)];
}

const ordered = cascadeOrder(stylesPath);
const onPage = (declaration: Declaration) =>
  declaration.selectors.some((selector) => /^(?::root|html)\b|\(html[:)]/.test(selector));

describe('theme.css owns every token', () => {
  it('declares no page-level token outside theme.css (and the generated payload-tokens.css)', () => {
    const offenders = ordered
      .filter((declaration) => declaration.file !== themePath)
      .filter((declaration) => declaration.file !== payloadTokensPath)
      .filter(onPage)
      .map(({ file, name }) => `${relative(root, file)}: ${name}`);

    expect([...new Set(offenders)]).toEqual([]);
  });

  it("keeps theme.css's own :root values in force: no later sheet in theme.frogbot redeclares them", () => {
    const fromTheme = ordered.filter(
      (declaration) =>
        declaration.file === themePath &&
        declaration.layer === 'theme.frogbot' &&
        declaration.selectors.includes(':root'),
    );

    const lastThemeIndex = Math.max(
      ...fromTheme.map((declaration) => ordered.indexOf(declaration)),
    );

    const later = ordered.slice(lastThemeIndex + 1);

    const shadowed = fromTheme.flatMap((theme) =>
      later
        .filter(
          (other) =>
            other.name === theme.name &&
            other.layer === 'theme.frogbot' &&
            other.selectors.includes(':root'),
        )
        .map(
          (other) =>
            `${theme.name}: theme.css "${theme.value}" is overridden by ${relative(root, other.file)} "${other.value}"`,
        ),
    );

    expect(fromTheme.length).toBeGreaterThan(100);
    expect([...new Set(shadowed)]).toEqual([]);
  });
});
