import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const squareIcon: IconNode = [
  ['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2' }],
];

const SquareIcon = createLucideIcon('SquareIcon', squareIcon);

export default SquareIcon;
