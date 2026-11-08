import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const trendingUpIcon: IconNode = [
  [
    'path',
    {
      d: 'M2.5 14.1667L5.8333 10.8333C6.5688 10.0978 6.9365 9.7302 7.3879 9.6895 7.4625 9.6828 7.5375 9.6828 7.6121 9.6895 8.0635 9.7302 8.4312 10.0978 9.1667 10.8333 9.9022 11.5688 10.2698 11.9365 10.7212 11.9772 10.7958 11.9839 10.8708 11.9839 10.9455 11.9772 11.3968 11.9365 11.7645 11.5688 12.5 10.8333L16.6667 6.6667',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M13.3333 6.0638C13.3333 6.0638 16.7508 5.5452 17.2695 6.0638 17.7882 6.5825 17.2695 10 17.2695 10',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const TrendingUpIcon = createLucideIcon('TrendingUpIcon', trendingUpIcon, undefined, '0 0 20 20');

export default TrendingUpIcon;
