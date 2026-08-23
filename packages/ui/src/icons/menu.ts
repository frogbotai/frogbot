import createLucideIcon from './createLucideIcon';
import type { IconNode } from './types';

const menu: IconNode = [
  ['path', { d: 'M4 12h16' }],
  ['path', { d: 'M4 6h16' }],
  ['path', { d: 'M4 18h16' }],
];

export const MenuIcon = createLucideIcon('Menu', menu);
