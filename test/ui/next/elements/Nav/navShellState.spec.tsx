import { describe, expect, it } from 'vitest';

import { getNavShellState } from '../../../../../packages/next/src/elements/Nav/navShellState';

describe('getNavShellState', () => {
  it.each([
    [false, true, 'desktop-nav-open'],
    [false, false, 'desktop-nav-closed'],
    [true, true, 'mobile-nav-open'],
    [true, false, 'mobile-nav-closed'],
  ] as const)('isMobile=%s navOpen=%s → %s', (isMobile, navOpen, expected) => {
    expect(getNavShellState(isMobile, navOpen)).toBe(expected);
  });
});
