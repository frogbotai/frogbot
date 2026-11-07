import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const tableIcon: IconNode = [
  [
    'path',
    {
      d: 'M16.7557 16.7573C15.5963 17.9168 13.7304 17.9168 9.9984 17.9168 6.2665 17.9168 4.4005 17.9168 3.2411 16.7573 2.0818 15.598 2.0818 13.732 2.0818 10.0001 2.0818 6.2681 2.0818 4.4021 3.2411 3.2428 4.4005 2.0834 6.2665 2.0834 9.9984 2.0834 13.7303 2.0834 15.5963 2.0834 16.7557 3.2428 17.9151 4.4021 17.9151 6.2681 17.9151 10.0001 17.9151 13.732 17.9151 15.598 16.7557 16.7573Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M7.4984 17.9168L7.4984 2.0834',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M17.9151 6.6667L2.0818 6.6667',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M17.9151 13.3334H2.0818',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const TableIcon = createLucideIcon('TableIcon', tableIcon, undefined, '0 0 20 20');

export default TableIcon;
