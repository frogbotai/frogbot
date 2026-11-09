import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const brandFrogBotIcon: IconNode = [
  [
    'path',
    {
      d: 'M10 0a10 10 0 1 0 0 20a10 10 0 1 0 0 -20Z M5.6 4.1a2.5 2.5 0 1 0 0 5.0a2.5 2.5 0 1 0 0 -5.0Z M5.6 5.6a1.0 1.0 0 1 0 0 2.0a1.0 1.0 0 1 0 0 -2.0Z M14.4 4.1a2.5 2.5 0 1 0 0 5.0a2.5 2.5 0 1 0 0 -5.0Z M14.4 5.6a1.0 1.0 0 1 0 0 2.0a1.0 1.0 0 1 0 0 -2.0Z M2 10.6H18C17.4 13.6 14.2 15.4 10 15.4C5.8 15.4 2.6 13.6 2 10.6Z',
      fill: 'var(--color-icon-brand, #2f964f)',
      fillRule: 'evenodd',
    },
  ],
];

const BrandFrogBotIcon = createLucideIcon('BrandFrogBotIcon', brandFrogBotIcon, 0, '0 0 20 20');

export default BrandFrogBotIcon;
