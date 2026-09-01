import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const plusSignIcon: IconNode = [
  [
    'path',
    {
      d: 'M12 4V20M20 12H4',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const PlusSignIcon = createLucideIcon('PlusSign', plusSignIcon);

export default PlusSignIcon;
