import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const brandTwitterIcon: IconNode = [
  ['path', { d: 'M3 3L14.5 21H21L9.5 3Z' }],
  ['path', { d: 'M3 21L10.017 13.983' }],
  ['path', { d: 'M13.983 10.017L21 3' }],
];

const BrandTwitterIcon = createLucideIcon('BrandTwitterIcon', brandTwitterIcon);

export default BrandTwitterIcon;
