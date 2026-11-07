import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const flameIcon: IconNode = [
  [
    'path',
    {
      d: 'M11.5467 18.3333C21.7319 15.8333 16.0282 5.8333 9.1023 1.6667 8.2878 4.5833 7.0653 5.4167 4.6208 8.3333 1.3843 12.1949 2.9913 16.6667 7.4727 18.3333 6.7937 17.5 5.0413 15.7507 6.25 13.3333 6.6667 12.5 7.5 11.6667 7.0833 10 7.8981 10.4167 9.5833 10.8333 10 12.9167 10.679 12.0833 11.3837 10.3333 10.7319 8.3333 15.8333 12.0833 13.75 15.8333 11.5467 18.3333Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const FlameIcon = createLucideIcon('FlameIcon', flameIcon, undefined, '0 0 20 20');

export default FlameIcon;
