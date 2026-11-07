import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const coinsIcon: IconNode = [
  [
    'path',
    {
      d: 'M14.4388 13.6739A5.5 2.5 0 1 1 5.5598 15.2572',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M13.9705 11.6163A5.5 2.5 0 1 1 5.4516 9.7941',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M14.9388 6.1739A5.5 2.5 0 1 1 6.0598 7.7572',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M3.5 4.375A5.5 2.5 0 1 0 14.5 4.375A5.5 2.5 0 1 0 3.5 4.375Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const CoinsIcon = createLucideIcon('CoinsIcon', coinsIcon, undefined, '0 0 20 20');

export default CoinsIcon;
