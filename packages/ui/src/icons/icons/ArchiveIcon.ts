import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const archiveIcon: IconNode = [
  [
    'path',
    {
      d: 'M3.75 6.6667H16.25C16.6373 6.6667 16.8308 6.6667 16.9918 6.6346 17.653 6.5031 18.1698 5.9863 18.3013 5.3251 18.3333 5.1642 18.3333 4.9706 18.3333 4.5833 18.3333 4.1961 18.3333 4.0025 18.3013 3.8415 18.1698 3.1804 17.653 2.6635 16.9918 2.532 16.8308 2.5 16.6373 2.5 16.25 2.5H3.75C3.3628 2.5 3.1692 2.5 3.0082 2.532 2.347 2.6635 1.8302 3.1804 1.6987 3.8415 1.6667 4.0025 1.6667 4.1961 1.6667 4.5833 1.6667 4.9706 1.6667 5.1642 1.6987 5.3251 1.8302 5.9863 2.347 6.5031 3.0082 6.6346 3.1692 6.6667 3.3628 6.6667 3.75 6.6667Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M11.6667 10H8.3333',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M2.9167 6.6667H17.0833L16.6051 12.8835C16.4367 15.0736 16.3524 16.1686 15.6336 16.8343 14.9147 17.5 13.8164 17.5 11.6198 17.5H8.3802C6.1836 17.5 5.0853 17.5 4.3665 16.8343 3.6476 16.1686 3.5634 15.0736 3.3949 12.8835L2.9167 6.6667Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const ArchiveIcon = createLucideIcon('ArchiveIcon', archiveIcon, undefined, '0 0 20 20');

export default ArchiveIcon;
