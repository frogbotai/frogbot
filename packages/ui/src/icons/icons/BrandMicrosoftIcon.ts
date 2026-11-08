import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const brandMicrosoftIcon: IconNode = [
  [
    'path',
    {
      d: 'M1 1h10v10H1z',
      fill: 'currentColor',
    },
  ],
  [
    'path',
    {
      d: 'M12 1h10v10H12z',
      fill: 'currentColor',
    },
  ],
  [
    'path',
    {
      d: 'M1 12h10v10H1z',
      fill: 'currentColor',
    },
  ],
  [
    'path',
    {
      d: 'M12 12h10v10H12z',
      fill: 'currentColor',
    },
  ],
];

const BrandMicrosoftIcon = createLucideIcon(
  'BrandMicrosoftIcon',
  brandMicrosoftIcon,
  0,
  '0 0 23 23',
);

export default BrandMicrosoftIcon;
