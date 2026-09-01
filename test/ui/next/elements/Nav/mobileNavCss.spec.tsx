import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve('packages/next/src/css.css'), 'utf8');

describe('mobile nav CSS', () => {
  it('hides the default mobile nav toggler in the FrogBot shell', () => {
    expect(css).toMatch(
      /body:has\(\.frogbot-nav-shell\) \.app-header__mobile-nav-toggler[^{]*\{[^}]*display:\s*none;/,
    );
  });

  it('does not force the collapsed desktop grid width', () => {
    const rule = css.match(
      /\.template-default:has\(\.frogbot-admin-sidebar\[data-collapsed="true"\]\)\s*\{[^}]+\}/,
    )?.[0];
    expect(rule).toBeDefined();
    expect(rule).not.toContain('!important');
  });

  it('removes the closed mobile nav from layout and overlays it while open', () => {
    const mobile = css.match(/@media \(max-width: 767px\) \{[\s\S]+\n\}/)?.[0];
    expect(mobile).toMatch(/\.template-default \.frogbot-nav-shell\s*\{[^}]*display:\s*none;/);
    expect(mobile).toMatch(
      /\.template-default \.frogbot-nav-shell\.nav--nav-open\s*\{[^}]*display:\s*block;/,
    );
    expect(mobile).toMatch(
      /\.template-default \.frogbot-nav-shell\.nav--nav-open\s*\{[^}]*position:\s*fixed;/,
    );
  });
});
