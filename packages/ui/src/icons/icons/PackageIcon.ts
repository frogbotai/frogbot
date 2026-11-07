import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const packageIcon: IconNode = [
  [
    'path',
    {
      d: 'M10 18.3333C9.3182 18.3333 8.6668 18.0582 7.3641 17.5079 4.1214 16.1381 2.5 15.4532 2.5 14.3011 2.5 13.9785 2.5 8.3871 2.5 5.8333M10 18.3333C10.6818 18.3333 11.3332 18.0582 12.6359 17.5079 15.8787 16.1381 17.5 15.4532 17.5 14.3011V5.8333M10 18.3333L10 9.4623',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M6.9383 8.0762L4.5039 6.8982C3.168 6.2518 2.5 5.9285 2.5 5.4167 2.5 4.9048 3.168 4.5816 4.5039 3.9351L6.9383 2.7572C8.4407 2.0302 9.1919 1.6667 10 1.6667 10.8081 1.6667 11.5593 2.0302 13.0617 2.7572L15.4961 3.9351C16.832 4.5816 17.5 4.9048 17.5 5.4167 17.5 5.9285 16.832 6.2518 15.4961 6.8982L13.0617 8.0762C11.5593 8.8032 10.8081 9.1667 10 9.1667 9.1919 9.1667 8.4407 8.8032 6.9383 8.0762Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M5 10L6.6667 10.8333',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M14.1667 3.3333L5.8333 7.5',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const PackageIcon = createLucideIcon('PackageIcon', packageIcon, undefined, '0 0 20 20');

export default PackageIcon;
