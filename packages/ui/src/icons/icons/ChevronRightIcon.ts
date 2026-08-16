import createLucideIcon from '../createLucideIcon';
import type { IconNode } from '../types';

export const chevronRightIcon: IconNode = [
  [
    'path',
    {
      d: 'M15 18C15 18 21 13.5811 21 12C21 10.4188 15 6 15 6',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const ChevronRightIcon = createLucideIcon('ChevronRightIcon', chevronRightIcon);

export default ChevronRightIcon;
