import { describe, expect, it } from 'vitest';

import {
  checkDesign,
  DESIGN,
  readDesign,
  uiExports,
  uiTokens,
} from '../../../scripts/check-skill-design.mjs';

const exports = uiExports(
  "export { Badge, type BadgeProps } from './badge.js';\nexport {\n  Card,\n  CardTitle as Title,\n} from './card.js';\n",
);

const tokens = uiTokens([
  '@layer frogbot { :root { --color-text: #000; --fb-text-2xl: 1.5rem; } }',
]);

const check = (markdown: string) => checkDesign({ markdown, exports, tokens });

describe('checkDesign', () => {
  it('passes tokens and components that exist, in prose and in fences', () => {
    expect(
      check(
        "Use `Card`, `Badge` and `--color-text`, or `font-size: var(--fb-text-2xl)`.\n\n```tsx\nimport { Badge, Title } from '@frogbotai/ui';\nconst css = 'color: var(--color-text)';\n```\n",
      ),
    ).toEqual([]);
  });

  it('names the line of a made-up token or component', () => {
    expect(check('# Design\n\nUse `--color-made-up` in a `StatTile`.\n')).toEqual([
      `${DESIGN}:3 names token --color-made-up, which packages/ui/src doesn't define`,
      `${DESIGN}:3 names StatTile, which @frogbotai/ui doesn't export`,
    ]);
  });

  it('checks names imported from @frogbotai/ui in a fence, and ignores other packages', () => {
    expect(
      check(
        "Intro.\n\n```tsx\nimport { Card, Metric } from '@frogbotai/ui';\nimport type { WidgetServerProps } from 'frogbot';\n```\n",
      ),
    ).toEqual([`${DESIGN}:4 names Metric, which @frogbotai/ui doesn't export`]);
  });

  it('finds a made-up component in a multi-name span, a JSX tag or a default import', () => {
    expect(
      check(
        "Use `Card, StatTile` here.\n\n```tsx\nimport Meter from '@frogbotai/ui';\nconst a = <Gauge />;\n```\n",
      ),
    ).toEqual([
      `${DESIGN}:1 names StatTile, which @frogbotai/ui doesn't export`,
      `${DESIGN}:4 names Meter, which @frogbotai/ui doesn't export`,
      `${DESIGN}:5 names Gauge, which @frogbotai/ui doesn't export`,
    ]);
  });

  it('catches acronym names, and skips type arguments, member tags and phrases', () => {
    expect(
      check(
        'Use `KPICard`, `Promise<void>` or `Build all`.\n\n```tsx\nconst a: Record<string, number> = {};\nconst b = <React.Fragment />;\n```\n',
      ),
    ).toEqual([`${DESIGN}:1 names KPICard, which @frogbotai/ui doesn't export`]);
  });

  it('passes the real skill file', () => {
    expect(checkDesign(readDesign())).toEqual([]);
  });
});
