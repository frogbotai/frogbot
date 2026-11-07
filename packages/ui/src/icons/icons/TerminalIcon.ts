import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const terminalIcon: IconNode = [
  [
    'path',
    {
      d: 'M11.6667 3.3333H8.3333C5.1906 3.3333 3.6193 3.3333 2.643 4.3096 1.6667 5.286 1.6667 6.8573 1.6667 10 1.6667 13.1427 1.6667 14.7141 2.643 15.6903 3.6193 16.6667 5.1906 16.6667 8.3333 16.6667H11.6667C14.8093 16.6667 16.3808 16.6667 17.357 15.6903 18.3333 14.7141 18.3333 13.1427 18.3333 10 18.3333 6.8573 18.3333 5.286 17.357 4.3096 16.3808 3.3333 14.8093 3.3333 11.6667 3.3333Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M5.8333 7.5L7.3665 8.8215C8.0111 9.3771 8.3333 9.6548 8.3333 10 8.3333 10.3452 8.0111 10.6229 7.3665 11.1785L5.8333 12.5',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M10.8333 13.3333H14.1667',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const TerminalIcon = createLucideIcon('TerminalIcon', terminalIcon, undefined, '0 0 20 20');

export default TerminalIcon;
