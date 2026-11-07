import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const activityIcon: IconNode = [
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
      d: 'M5.8333 10H5.9283C6.487 10 6.7664 10 6.9805 9.8516 7.1946 9.7033 7.2927 9.4417 7.4889 8.9185L8.1957 7.0336C8.2785 6.8129 8.4895 6.6667 8.7252 6.6667 8.9847 6.6667 9.2108 6.8433 9.2738 7.095L10.7263 12.905C10.7892 13.1568 11.0153 13.3333 11.2748 13.3333 11.5105 13.3333 11.7215 13.1872 11.8043 12.9664L12.5111 11.0815C12.7073 10.5583 12.8053 10.2967 13.0195 10.1484 13.2337 10 13.513 10 14.0717 10H14.1667',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const ActivityIcon = createLucideIcon('ActivityIcon', activityIcon, undefined, '0 0 20 20');

export default ActivityIcon;
