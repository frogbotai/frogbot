import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const trendingDownIcon: IconNode = [
  [
    'path',
    {
      d: 'M2.5 5.8333L5.8333 9.1667C6.5688 9.9022 6.9365 10.2698 7.3879 10.3105 7.4625 10.3172 7.5375 10.3172 7.6121 10.3105 8.0635 10.2698 8.4312 9.9022 9.1667 9.1667 9.9022 8.4312 10.2698 8.0635 10.7212 8.0228 10.7958 8.0161 10.8708 8.0161 10.9455 8.0228 11.3968 8.0635 11.7645 8.4312 12.5 9.1667L16.6667 13.3333',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M17.2695 10C17.2695 10 17.7881 13.4175 17.2695 13.9362 16.7508 14.4548 13.3333 13.9362 13.3333 13.9362',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const TrendingDownIcon = createLucideIcon(
  'TrendingDownIcon',
  trendingDownIcon,
  undefined,
  '0 0 20 20',
);

export default TrendingDownIcon;
