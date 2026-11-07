import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const chartBarIcon: IconNode = [
  [
    'path',
    {
      d: 'M10 17.5C6.4645 17.5 4.6967 17.5 3.5983 16.4017 2.5 15.3033 2.5 13.5355 2.5 10 2.5 6.4645 2.5 4.6967 3.5983 3.5983 4.6967 2.5 6.4645 2.5 10 2.5 13.5355 2.5 15.3033 2.5 16.4017 3.5983 17.5 4.6967 17.5 6.4645 17.5 10 17.5 13.5355 17.5 15.3033 16.4017 16.4017 15.3033 17.5 13.5355 17.5 10 17.5Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M6.6667 14.1667V8.3333M10 14.1667L10 5.8333M13.3333 14.1667V10.8333',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const ChartBarIcon = createLucideIcon('ChartBarIcon', chartBarIcon, undefined, '0 0 20 20');

export default ChartBarIcon;
