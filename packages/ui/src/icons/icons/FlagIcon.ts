import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const flagIcon: IconNode = [
  [
    'path',
    {
      d: 'M3.3333 5.8333L3.3333 17.5',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M9.798 3.2572C7.0436 1.8541 4.876 2.6762 3.7952 3.516 3.6004 3.6674 3.503 3.7431 3.4182 3.9164 3.3333 4.0897 3.3333 4.2511 3.3333 4.574V12.2766C4.1414 11.3618 6.5657 9.944 9.798 11.5905 12.6867 13.062 15.1451 12.452 16.3081 11.8163 16.4694 11.7281 16.5501 11.6839 16.6084 11.5857 16.6667 11.4874 16.6667 11.3808 16.6667 11.1674V4.8949C16.6667 4.2045 16.6667 3.8593 16.5023 3.7342 16.3377 3.6092 15.953 3.7158 15.1835 3.9292 13.8667 4.2943 11.9519 4.3544 9.798 3.2572Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const FlagIcon = createLucideIcon('FlagIcon', flagIcon, undefined, '0 0 20 20');

export default FlagIcon;
