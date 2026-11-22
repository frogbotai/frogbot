import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  recoveryCodesLeft,
  recoveryLeftBody,
  ROLES,
} from '../../../packages/plugins/plugin-two-factor/src/page.js';

type Alias = { alias?: string; Value?: string };

const figma = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../../packages/ui/design-system/figma.json'), 'utf8'),
) as {
  collections: {
    Primitives: Record<string, { Value: string }>;
    Color: Record<string, { Light: Alias; Dark: Alias }>;
  };
};

const resolve = (value: Alias) =>
  value.alias ? figma.collections.Primitives[value.alias].Value : value.Value;

describe('two-factor pages', () => {
  it('uses the design system color roles in light and dark', () => {
    for (const [theme, mode] of [
      ['light', 'Light'],
      ['dark', 'Dark'],
    ] as const) {
      for (const [role, value] of Object.entries(ROLES[theme])) {
        expect(value, `${theme} ${role}`).toBe(resolve(figma.collections.Color[role][mode]));
      }
    }
  });

  it('counts the recovery codes left', () => {
    expect(recoveryCodesLeft(9)).toBe('9 recovery codes left.');
    expect(recoveryCodesLeft(1)).toBe('1 recovery code left.');
    expect(recoveryCodesLeft(0)).toBe('No recovery codes left.');
  });

  it('links to making new recovery codes only when 3 or fewer are left', () => {
    const page = (left: number, account?: string) =>
      recoveryLeftBody({ left, next: '/admin', account });

    expect(page(4, '/admin/account')).not.toContain('Make new recovery codes');
    expect(page(3, '/admin/account')).toContain(
      '<a href="/admin/account">Make new recovery codes</a>',
    );
    expect(page(0, '/admin/account')).toContain('No recovery codes left.');
    expect(page(2)).toContain('Make new recovery codes from your account');
    expect(page(2)).not.toContain('<a href="/admin/account"');
    expect(page(9)).toContain('<a class="button" href="/admin">Continue</a>');
  });
});
