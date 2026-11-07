import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const shieldIcon: IconNode = [
  [
    'path',
    {
      d: 'M15.5907 2.9128C14.0138 2.1282 12.0841 1.6667 10 1.6667 7.9159 1.6667 5.9863 2.1282 4.4093 2.9128 3.636 3.2975 3.2493 3.4899 2.8747 4.0948 2.5 4.6997 2.5 5.2854 2.5 6.4568V9.3643C2.5 14.1004 6.2853 16.7337 8.4775 17.8615 9.0889 18.1761 9.3946 18.3333 10 18.3333 10.6054 18.3333 10.9111 18.1761 11.5224 17.8615 13.7147 16.7337 17.5 14.1004 17.5 9.3643L17.5 6.4568C17.5 5.2854 17.5 4.6997 17.1253 4.0948 16.7507 3.4899 16.364 3.2975 15.5907 2.9128Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const ShieldIcon = createLucideIcon('ShieldIcon', shieldIcon, undefined, '0 0 20 20');

export default ShieldIcon;
