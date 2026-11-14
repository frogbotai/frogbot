import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const arrowRightToLineIcon: IconNode = [
  ['path', { d: 'M17 12H3' }],
  ['path', { d: 'm11 18 6-6-6-6' }],
  ['path', { d: 'M21 5v14' }],
];

const ArrowRightToLineIcon = createLucideIcon('ArrowRightToLine', arrowRightToLineIcon);

export default ArrowRightToLineIcon;
