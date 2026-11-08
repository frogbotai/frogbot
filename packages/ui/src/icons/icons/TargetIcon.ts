import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const targetIcon: IconNode = [
  [
    'path',
    {
      d: 'M12.6093 2.0833C11.7885 1.813 10.9113 1.6667 10 1.6667 5.3976 1.6667 1.6667 5.3976 1.6667 10 1.6667 14.6023 5.3976 18.3333 10 18.3333 14.6023 18.3333 18.3333 14.6023 18.3333 10 18.3333 9.129 18.1997 8.2892 17.9518 7.5',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M14.1667 10C14.1667 12.3012 12.3012 14.1667 10 14.1667 7.6988 14.1667 5.8333 12.3012 5.8333 10 5.8333 7.6988 7.6988 5.8333 10 5.8333',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M16.25 3.75L10 10M16.25 3.75V1.6667M16.25 3.75H18.3333',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const TargetIcon = createLucideIcon('TargetIcon', targetIcon, undefined, '0 0 20 20');

export default TargetIcon;
