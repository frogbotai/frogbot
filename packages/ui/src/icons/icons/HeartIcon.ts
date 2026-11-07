import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const heartIcon: IconNode = [
  [
    'path',
    {
      d: 'M1.6667 7.2454C1.6667 10.8623 6.3245 14.8817 8.6756 16.6398 9.4667 17.2313 10.5333 17.2313 11.3244 16.6398 13.6755 14.8817 18.3333 10.8623 18.3333 7.2454 18.3333 4.8547 16.5789 2.9167 14.1667 2.9167 12.9167 2.9167 11.6667 3.3333 10 5 8.3333 3.3333 7.0833 2.9167 5.8333 2.9167 3.4211 2.9167 1.6667 4.8547 1.6667 7.2454Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const HeartIcon = createLucideIcon('HeartIcon', heartIcon, undefined, '0 0 20 20');

export default HeartIcon;
