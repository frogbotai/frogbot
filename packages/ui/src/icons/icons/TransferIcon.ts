import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const transferIcon: IconNode = [
  [
    'path',
    {
      d: 'M15.8333 7.5H5.5488C4.7106 7.5 4.2916 7.5 4.1873 7.2428 4.083 6.9856 4.3793 6.6829 4.972 6.0774L6.8424 4.1667',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M4.1667 12.5H14.4512C15.2893 12.5 15.7084 12.5 15.8128 12.7573 15.917 13.0144 15.6207 13.3172 15.028 13.9226L13.1576 15.8333',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const TransferIcon = createLucideIcon('TransferIcon', transferIcon, undefined, '0 0 20 20');

export default TransferIcon;
