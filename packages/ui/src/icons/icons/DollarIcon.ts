import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const dollarIcon: IconNode = [
  [
    'path',
    {
      d: 'M5 12.9167C5 14.5275 6.3058 15.8333 7.9167 15.8333H12.0833C13.6942 15.8333 15 14.5275 15 12.9167 15 11.3058 13.6942 10 12.0833 10H7.9167C6.3058 10 5 8.6942 5 7.0833 5 5.4725 6.3058 4.1667 7.9167 4.1667H12.0833C13.6942 4.1667 15 5.4725 15 7.0833',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M10 2.0833V4.1667M10 15.8333V17.9167',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const DollarIcon = createLucideIcon('DollarIcon', dollarIcon, undefined, '0 0 20 20');

export default DollarIcon;
