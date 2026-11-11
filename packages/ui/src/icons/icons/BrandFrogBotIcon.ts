import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const brandFrogBotIcon: IconNode = [
  ['circle', { cx: '50', cy: '60', r: '50', fill: 'var(--color-icon-brand, #2f964f)' }],
  [
    'path',
    {
      d: 'M 0.044,62.1 H 99.956 A 50 50 0 0 1 99.49,67.1 H 0.51 A 50 50 0 0 1 0.044,62.1 Z M 21.8,41.8 c 2.8,0 5.1,2.3 5.1,5.1 0,2.8 -2.3,5.1 -5.1,5.1 -2.8,0 -5.1,-2.3 -5.1,-5.1 0,-2.9 2.3,-5.1 5.1,-5.1 m 0,-7.7 c -7,0 -12.7,5.7 -12.7,12.7 0,7 5.7,12.7 12.7,12.7 7,0 12.7,-5.7 12.7,-12.7 0,-7 -5.7,-12.7 -12.7,-12.7 z m 56.4,7.7 c 2.8,0 5.1,2.3 5.1,5.1 0,2.8 -2.3,5.1 -5.1,5.1 -2.8,0 -5.1,-2.3 -5.1,-5.1 0.1,-2.9 2.3,-5.1 5.1,-5.1 m 0,-7.7 c -7,0 -12.7,5.7 -12.7,12.7 0,7 5.7,12.7 12.7,12.7 7,0 12.7,-5.7 12.7,-12.7 0,-7 -5.7,-12.7 -12.7,-12.7 z',
      fill: '#FFFFFF',
    },
  ],
];

const BrandFrogBotIcon = createLucideIcon('BrandFrogBotIcon', brandFrogBotIcon, 0, '0 10 100 100');

export default BrandFrogBotIcon;
