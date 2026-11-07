import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const clockIcon: IconNode = [
  [
    'path',
    {
      d: 'M1.6667 10A8.3333 8.3333 0 1 0 18.3333 10 8.3333 8.3333 0 1 0 1.6667 10Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M10 6.6667V10L11.6667 11.6667',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const ClockIcon = createLucideIcon('ClockIcon', clockIcon, undefined, '0 0 20 20');

export default ClockIcon;
