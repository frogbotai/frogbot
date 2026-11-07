import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const awardIcon: IconNode = [
  [
    'path',
    {
      d: 'M3.75 7.9167C3.75 11.3684 6.5482 14.1667 10 14.1667 13.4518 14.1667 16.25 11.3684 16.25 7.9167 16.25 4.4649 13.4518 1.6667 10 1.6667 6.5482 1.6667 3.75 4.4649 3.75 7.9167Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M7.5 8.4723C7.5 8.4723 8.125 8.4723 8.75 9.5833 8.75 9.5833 10.7353 6.8056 12.5 6.25',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M14.0688 12.5L14.6273 15.1749C14.9861 16.8936 15.1655 17.7529 14.7969 18.1603 14.4284 18.5675 13.7883 18.2172 12.5083 17.5165L10.6137 16.4794C10.3112 16.3138 10.1599 16.2311 10 16.2311 9.8401 16.2311 9.6888 16.3138 9.3863 16.4794L7.4917 17.5165C6.2116 18.2172 5.5716 18.5675 5.203 18.1603 4.8345 17.7529 5.0139 16.8936 5.3728 15.1749L5.9313 12.5',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const AwardIcon = createLucideIcon('AwardIcon', awardIcon, undefined, '0 0 20 20');

export default AwardIcon;
