import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const coinsIcon: IconNode = [
  [
    'path',
    {
      d: 'M7.5 9.1667A5.4167 1.6667 0 1 0 18.3333 9.1667 5.4167 1.6667 0 1 0 7.5 9.1667Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M18.3333 12.9167C18.3333 13.8372 15.9083 14.5833 12.9167 14.5833 9.9251 14.5833 7.5 13.8372 7.5 12.9167',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M18.3333 9.1667V16.5C18.3333 17.5125 15.9083 18.3333 12.9167 18.3333 9.9251 18.3333 7.5 17.5125 7.5 16.5V9.1667',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M1.6667 3.3333A5.4167 1.6667 0 1 0 12.5 3.3333 5.4167 1.6667 0 1 0 1.6667 3.3333Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M5 9.1667C3.4235 8.9748 1.9749 8.4787 1.6667 7.5',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M5 17.5C3.4235 17.3082 1.9749 16.8121 1.6667 15.8333V3.3333',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M12.5 5V3.3333',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const CoinsIcon = createLucideIcon('CoinsIcon', coinsIcon, undefined, '0 0 20 20');

export default CoinsIcon;
