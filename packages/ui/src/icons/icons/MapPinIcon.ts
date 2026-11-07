import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const mapPinIcon: IconNode = [
  [
    'path',
    {
      d: 'M11.3481 17.8058C10.9868 18.1442 10.5037 18.3333 10.0009 18.3333 9.4982 18.3333 9.0152 18.1442 8.6538 17.8058 5.3442 14.6883 0.909 11.2058 3.0719 6.1497 4.2414 3.416 7.0486 1.6667 10.0009 1.6667 12.9533 1.6667 15.7605 3.416 16.93 6.1497 19.0902 11.1994 14.6658 14.6991 11.3481 17.8058Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M12.9167 9.1667C12.9167 10.7775 11.6108 12.0833 10 12.0833 8.3892 12.0833 7.0833 10.7775 7.0833 9.1667 7.0833 7.5558 8.3892 6.25 10 6.25 11.6108 6.25 12.9167 7.5558 12.9167 9.1667Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const MapPinIcon = createLucideIcon('MapPinIcon', mapPinIcon, undefined, '0 0 20 20');

export default MapPinIcon;
