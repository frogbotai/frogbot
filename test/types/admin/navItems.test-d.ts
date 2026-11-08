import type { FrogBotRequest, NavItemsArgs, NavItemsFunction } from 'frogbot';
import { expectTypeOf } from 'vitest';

expectTypeOf<NavItemsArgs['req']>().toEqualTypeOf<FrogBotRequest | undefined>();

export const navItems: NavItemsFunction = ({ req }) => [
  { label: req?.frogbot ? 'With frogbot' : 'Without', path: '/admin' },
];
