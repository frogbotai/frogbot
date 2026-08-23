import createLucideIcon from './createLucideIcon';
import type { IconNode } from './types';

const check: IconNode = [['path', { d: 'M20 6 9 17l-5-5' }]];

export const CheckIcon = createLucideIcon('Check', check);
