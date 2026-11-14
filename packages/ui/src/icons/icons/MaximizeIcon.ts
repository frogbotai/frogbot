import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const maximizeIcon: IconNode = [
  ['path', { d: 'M15 3h6v6' }],
  ['path', { d: 'm21 3-7 7' }],
  ['path', { d: 'm3 21 7-7' }],
  ['path', { d: 'M9 21H3v-6' }],
];

const MaximizeIcon = createLucideIcon('Maximize', maximizeIcon);

export default MaximizeIcon;
