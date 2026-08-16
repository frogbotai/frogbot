import createLucideIcon from '../createLucideIcon';
import type { IconNode } from '../types';

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
