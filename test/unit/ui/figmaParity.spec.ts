import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

interface FigmaSnapshot {
  collections: Record<string, Record<string, Record<string, { alias: string } | number | string>>>;
  textStyles: Record<string, { lineHeight: number | string; size: number }>;
}

const root = join(import.meta.dirname, '../../..');
const snapshot: FigmaSnapshot = JSON.parse(
  readFileSync(join(root, 'packages/ui/design-system/figma.json'), 'utf8'),
);

const theme = readFileSync(join(root, 'packages/ui/src/theme.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

const knownDifferences = {
  color: {
    'primary-hover':
      'Mixed from --primary so a custom primary gets matching states; Figma names green/300.',
    'primary-pressed':
      'Mixed from --primary so a custom primary gets matching states; Figma names green/500.',
  },
  radius: {
    'radius/sm': 'Owner to decide: FrogBot steps 4/6/8/12px from --radius, Figma 6/8/12/20px.',
    'radius/md': 'Owner to decide: FrogBot steps 4/6/8/12px from --radius, Figma 6/8/12/20px.',
    'radius/lg': 'Owner to decide: FrogBot steps 4/6/8/12px from --radius, Figma 6/8/12/20px.',
    'radius/xl': 'Owner to decide: FrogBot steps 4/6/8/12px from --radius, Figma 6/8/12/20px.',
  },
};

const appText = {
  'App/H1': '4xl',
  'App/H2': '3xl',
  'App/H3': '2xl',
  'App/H4': 'xl',
  'App/Lead': 'xl',
  'App/Large': 'lg',
  'App/Body': 'sm',
  'App/Small': 'xs',
} as const;

function block(selector: RegExp) {
  const match = selector.exec(theme);

  expect(match, `theme.css has a block for ${selector}`).not.toBeNull();

  const open = theme.lastIndexOf('{', match!.index + match![0].length - 1);
  const body = theme.slice(open + 1, theme.indexOf('}', open));

  return new Map(
    [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
  );
}

const ramps = block(/@layer theme\.frogbot \{\s*:root \{/);
const light = block(/:root,\s*\[data-theme="light"\] \{/);
const dark = new Map([...light, ...block(/\[data-theme="dark"\] \{/)]);
const scale = block(/--text-xs:/);
const frogbotScale = block(/--fb-radius:/);

const cssName = (figmaName: string) => `--${figmaName.replace('/', '-')}`;
const px = (rem: string | undefined) => Number.parseFloat(rem ?? 'NaN') * 16;

function radiusPx(value: string | undefined): number {
  const step = /^calc\(var\(--fb-radius\) ([+-]) (\d+)px\)$/.exec(value ?? '');
  const base = px(scale.get('--radius'));

  if (value === 'var(--fb-radius)') return base;
  if (!step) return Number.NaN;

  return step[1] === '+' ? base + Number(step[2]) : base - Number(step[2]);
}

describe("theme.css matches the designer's Figma design system", () => {
  it('declares every Figma primitive with the same color', () => {
    const differences = Object.entries(snapshot.collections.Primitives)
      .map(([name, { Value }]) => [cssName(name), Value, ramps.get(cssName(name))])
      .filter(([, figma, css]) => figma !== css);

    expect(differences).toEqual([]);
  });

  it('points every Figma color role at the same primitive, light and dark', () => {
    const differences = Object.entries(snapshot.collections.Color).flatMap(([name, modes]) =>
      (
        [
          ['Light', light],
          ['Dark', dark],
        ] as const
      )
        .map(([mode, declared]) => {
          const value = modes[mode];
          const expected =
            typeof value === 'object' ? `var(${cssName(value.alias)})` : String(value);

          return { css: declared.get(`--${name}`), expected, mode, name };
        })
        .filter(({ name: role }) => !(role in knownDifferences.color))
        .filter(({ css, expected }) => css !== expected),
    );

    expect(differences).toEqual([]);
  });

  it("matches the size and line height of Figma's app text styles", () => {
    const differences = Object.entries(appText).flatMap(([style, step]) => {
      const figma = snapshot.textStyles[style];
      const css = {
        lineHeight: px(frogbotScale.get(`--fb-text-${step}--line-height`)),
        size: px(scale.get(`--text-${step}`)),
      };

      return css.size === figma.size && css.lineHeight === figma.lineHeight
        ? []
        : [{ css, figma: { lineHeight: figma.lineHeight, size: figma.size }, style }];
    });

    expect(differences).toEqual([]);
  });

  it('steps spacing by the 4px Figma base', () => {
    expect(px(scale.get('--spacing'))).toBe(snapshot.collections.Spacing['spacing/1'].Value);
  });

  it('lists exactly the radius steps that still differ from Figma', () => {
    const differing = ['sm', 'md', 'lg', 'xl'].filter(
      (step) =>
        radiusPx(frogbotScale.get(`--fb-radius-${step}`)) !==
        snapshot.collections.Radius[`radius/${step}`].Value,
    );

    expect(differing.map((step) => `radius/${step}`)).toEqual(Object.keys(knownDifferences.radius));
  });

  it('lists exactly the color roles that differ on purpose', () => {
    const differing = Object.keys(knownDifferences.color).filter((name) => {
      const value = snapshot.collections.Color[name].Light;

      return typeof value === 'object' && light.get(`--${name}`) !== `var(${cssName(value.alias)})`;
    });

    expect(differing).toEqual(Object.keys(knownDifferences.color));
  });
});
