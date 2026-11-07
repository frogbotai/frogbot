import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const rookIcon: IconNode = [
  [
    'path',
    {
      d: 'M14.1667 18.3333H5.8333C5.4458 18.3333 5.2521 18.3333 5.0931 18.2907 4.6618 18.1752 4.3248 17.8382 4.2093 17.4068 4.1667 17.2479 4.1667 17.0542 4.1667 16.6667 4.1667 15.7462 4.9129 15 5.8333 15H14.1667C15.0872 15 15.8333 15.7462 15.8333 16.6667 15.8333 17.0542 15.8333 17.2479 15.7907 17.4068 15.6752 17.8382 15.3383 18.1752 14.9068 18.2907 14.7479 18.3333 14.5542 18.3333 14.1667 18.3333Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M13.3333 6.6667L15 3.3333H5L6.6667 6.6667H13.3333Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M5 1.6667V3.3333',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M8.3333 1.6667V3.3333',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M11.6667 1.6667V3.3333',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M15 1.6667V3.3333',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M14.1667 15H5.8333L6.6667 6.6667H13.3333L14.1667 15Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const RookIcon = createLucideIcon('RookIcon', rookIcon, undefined, '0 0 20 20');

export default RookIcon;
