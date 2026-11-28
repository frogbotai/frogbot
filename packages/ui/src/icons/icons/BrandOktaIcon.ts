import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const brandOktaIcon: IconNode = [
  [
    'path',
    {
      d: 'M12 0C5.389 0 0 5.35 0 12s5.35 12 12 12 12-5.35 12-12S18.611 0 12 0zm0 18c-3.325 0-6-2.675-6-6s2.675-6 6-6 6 2.675 6 6-2.675 6-6 6z',
      fill: 'currentColor',
    },
  ],
];

const BrandOktaIcon = createLucideIcon('BrandOktaIcon', brandOktaIcon, 0, '0 0 24 24');

export default BrandOktaIcon;
