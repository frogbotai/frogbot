import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const trophyIcon: IconNode = [
  [
    'path',
    {
      d: 'M10.8337 14.1663C10.8306 15.7178 11.5526 16.5471 12.3246 17.3266 12.4347 17.4378 12.4971 17.5875 12.4971 17.7439 12.4971 18.0696 12.233 18.3337 11.9073 18.3337H8.0868C7.7611 18.3337 7.4971 18.0696 7.4971 17.7439 7.4971 17.5875 7.5594 17.4378 7.6695 17.3266 8.4416 16.5471 9.1639 15.7178 9.167 14.1663',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M15.0557 3.3329H16.3057C17.2258 3.3329 17.9935 4.0796 17.9101 4.996 17.7122 7.1692 16.825 10.2974 13.3337 11.2496',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M4.9443 3.3329H3.6943C2.774 3.3329 2.0064 4.0796 2.0899 4.996 2.2878 7.1692 3.1749 10.2974 6.6663 11.2496',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M14.9956 3.35C14.6838 7.7127 13.3453 14.1663 10.0734 14.1663H9.86C6.646 14.1663 5.3127 7.7245 5.0035 3.3491 4.9381 2.4237 5.6999 1.6663 6.6404 1.6663H13.3598C14.3008 1.6663 15.0618 2.4243 14.9956 3.35Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const TrophyIcon = createLucideIcon('TrophyIcon', trophyIcon, undefined, '0 0 20 20');

export default TrophyIcon;
