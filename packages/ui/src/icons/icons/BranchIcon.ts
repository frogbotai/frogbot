import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const branchIcon: IconNode = [
  [
    'path',
    {
      d: 'M17.5 7.0833V5.5C17.5 4.0858 17.5 3.3787 17.0607 2.9393 16.6213 2.5 15.9143 2.5 14.5 2.5H12.9167M16.6667 3.3333L12.0833 7.9167',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M2.5 7.0833V5.5C2.5 4.0858 2.5 3.3787 2.9393 2.9393 3.3787 2.5 4.0858 2.5 5.5 2.5H7.0833M3.3333 3.3333L8.0474 8.0474C9.0108 9.0108 9.4925 9.4925 9.7462 10.1051 10 10.7177 10 11.3989 10 12.7614V17.5',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const BranchIcon = createLucideIcon('BranchIcon', branchIcon, undefined, '0 0 20 20');

export default BranchIcon;
