import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const lightbulbIcon: IconNode = [
  [
    'path',
    {
      d: 'M14.4097 13.3333C15.7938 12.1118 16.6667 10.3245 16.6667 8.3333 16.6667 4.6514 13.6818 1.6667 10 1.6667 6.3181 1.6667 3.3333 4.6514 3.3333 8.3333 3.3333 10.3245 4.2063 12.1118 5.5903 13.3333',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M10 9.1667V13.3333',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M7.0833 15.8333H12.9167',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M8.3333 18.3333H11.6667',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const LightbulbIcon = createLucideIcon('LightbulbIcon', lightbulbIcon, undefined, '0 0 20 20');

export default LightbulbIcon;
