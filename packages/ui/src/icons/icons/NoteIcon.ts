import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const noteIcon: IconNode = [
  [
    'path',
    {
      d: 'M13.75 1.6667V4.1667M6.25 1.6667V4.1667M10 1.6667V4.1667',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M10.8333 2.9167H9.1667C6.4168 2.9167 5.0419 2.9167 4.1876 3.7709 3.3333 4.6252 3.3333 6.0001 3.3333 8.75V12.5C3.3333 15.2498 3.3333 16.6248 4.1876 17.4791 5.0419 18.3333 6.4168 18.3333 9.1667 18.3333H10.8333C13.5832 18.3333 14.9581 18.3333 15.8124 17.4791 16.6667 16.6248 16.6667 15.2498 16.6667 12.5V8.75C16.6667 6.0001 16.6667 4.6252 15.8124 3.7709 14.9581 2.9167 13.5832 2.9167 10.8333 2.9167Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M6.6667 12.5H10M6.6667 9.1667H13.3333',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const NoteIcon = createLucideIcon('NoteIcon', noteIcon, undefined, '0 0 20 20');

export default NoteIcon;
