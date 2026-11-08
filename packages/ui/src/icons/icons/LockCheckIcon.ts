import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const lockCheckIcon: IconNode = [
  [
    'path',
    {
      d: 'M11.6667 16.6667C11.6667 16.6667 12.5 16.6667 13.3333 18.3333 13.3333 18.3333 15.9804 14.1667 18.3333 13.3333',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M15 11.6667C14.9588 11.1479 14.8971 10.6352 14.8287 10.1294 14.6405 8.7375 13.4831 7.6471 12.0747 7.5826 10.8894 7.5283 9.6855 7.5 8.3597 7.5 7.0339 7.5 5.83 7.5283 4.6448 7.5826 3.2363 7.6471 2.0789 8.7375 1.8907 10.1294 1.7679 11.0378 1.6667 11.9687 1.6667 12.9167 1.6667 13.8647 1.7679 14.7956 1.8907 15.7039 2.0789 17.0958 3.2363 18.1863 4.6448 18.2508 5.83 18.305 7.0339 18.3333 8.3597 18.3333 8.7787 18.3333 9.1854 18.3305 9.5833 18.3249',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M4.5833 7.5V5.4167C4.5833 3.3456 6.2623 1.6667 8.3333 1.6667 10.4044 1.6667 12.0833 3.3456 12.0833 5.4167V7.5',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const LockCheckIcon = createLucideIcon('LockCheckIcon', lockCheckIcon, undefined, '0 0 20 20');

export default LockCheckIcon;
