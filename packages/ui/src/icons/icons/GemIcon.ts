import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const gemIcon: IconNode = [
  [
    'path',
    {
      d: 'M8.3333 6.6667L11.6667 6.6667',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M7.3523 2.5H12.6477C13.7786 2.5 14.344 2.5 14.8398 2.7328L14.859 2.7419C15.3528 2.9789 15.7148 3.4193 16.4388 4.2999 17.7 5.8341 18.3306 6.6012 18.3333 7.5068L18.3332 7.5411C18.3238 8.4468 17.6874 9.209 16.4148 10.7335L12.5237 15.395C11.3523 16.7983 10.7667 17.5 10 17.5 9.2333 17.5 8.6477 16.7983 7.4762 15.395L3.5851 10.7335C2.3125 9.209 1.6763 8.4468 1.6668 7.5411L1.6667 7.5068C1.6694 6.6012 2.3 5.8341 3.5613 4.2999 4.2852 3.4193 4.6472 2.9789 5.141 2.7419L5.1602 2.7328C5.656 2.5 6.2214 2.5 7.3523 2.5Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const GemIcon = createLucideIcon('GemIcon', gemIcon, undefined, '0 0 20 20');

export default GemIcon;
