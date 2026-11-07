import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const codeIcon: IconNode = [
  [
    'path',
    {
      d: 'M13.3333 5.8333L15.8887 8.0358C16.9628 8.9618 17.5 9.4247 17.5 10 17.5 10.5753 16.9629 11.0383 15.8887 11.9642L13.3333 14.1667',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M6.6667 5.8333L4.1114 8.0358C3.0371 8.9618 2.5 9.4247 2.5 10 2.5 10.5753 3.0371 11.0383 4.1114 11.9642L6.6667 14.1667',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const CodeIcon = createLucideIcon('CodeIcon', codeIcon, undefined, '0 0 20 20');

export default CodeIcon;
