import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const creditCardIcon: IconNode = [
  [
    'path',
    {
      d: 'M8.3333 3.3333H11.6667C14.8093 3.3333 16.3808 3.3333 17.357 4.3096 18.3333 5.286 18.3333 6.8573 18.3333 10 18.3333 13.1427 18.3333 14.7141 17.357 15.6903 16.3808 16.6667 14.8093 16.6667 11.6667 16.6667H8.3333C5.1906 16.6667 3.6193 16.6667 2.643 15.6903 1.6667 14.7141 1.6667 13.1427 1.6667 10 1.6667 6.8573 1.6667 5.286 2.643 4.3096 3.6193 3.3333 5.1906 3.3333 8.3333 3.3333Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M2.0833 7.5H17.9167',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M11.6667 12.5L15 12.5',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const CreditCardIcon = createLucideIcon('CreditCardIcon', creditCardIcon, undefined, '0 0 20 20');

export default CreditCardIcon;
