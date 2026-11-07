import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const databaseIcon: IconNode = [
  [
    'path',
    {
      d: 'M3.3333 4.1667A6.6667 2.5 0 1 0 16.6667 4.1667 6.6667 2.5 0 1 0 3.3333 4.1667Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M5.8333 9.035C6.3347 9.1858 6.8953 9.3098 7.5 9.4017',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M16.6667 10C16.6667 11.3808 13.6819 12.5 10 12.5 6.3181 12.5 3.3333 11.3808 3.3333 10',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M5.8333 14.8683C6.3347 15.0191 6.8953 15.1432 7.5 15.235',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M16.6667 4.1667V15.8333C16.6667 17.2141 13.6819 18.3333 10 18.3333 6.3181 18.3333 3.3333 17.2141 3.3333 15.8333V4.1667',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const DatabaseIcon = createLucideIcon('DatabaseIcon', databaseIcon, undefined, '0 0 20 20');

export default DatabaseIcon;
