import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const boltIcon: IconNode = [
  [
    'path',
    {
      d: 'M4.3548 9.4412L10.1867 1.9554C10.6428 1.37 11.4977 1.7344 11.4977 2.5142V8.3083C11.4977 8.7754 11.8329 9.1542 12.2465 9.1542H15.083C15.7274 9.1542 16.0709 10.0124 15.6452 10.5588L9.8133 18.0446C9.3573 18.63 8.5023 18.2657 8.5023 17.4858V11.6917C8.5023 11.2246 8.1671 10.8458 7.7535 10.8458H4.917C4.2726 10.8458 3.9291 9.9876 4.3548 9.4412Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const BoltIcon = createLucideIcon('BoltIcon', boltIcon, undefined, '0 0 20 20');

export default BoltIcon;
