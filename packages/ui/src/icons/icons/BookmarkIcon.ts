import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const bookmarkIcon: IconNode = [
  [
    'path',
    {
      d: 'M3.75 15.1767V6.8626C3.75 4.6096 3.75 3.4832 4.4365 2.7832 5.1229 2.0833 6.2278 2.0833 8.4375 2.0833H11.5625C13.7723 2.0833 14.8771 2.0833 15.5635 2.7832 16.25 3.4832 16.25 4.6097 16.25 6.8626V15.1767C16.25 16.7728 16.25 17.571 15.7489 17.8397 15.2479 18.1084 14.6028 17.6563 13.3128 16.752L11.7704 15.6708C10.9137 15.0702 10.4853 14.77 10 14.77 9.5147 14.77 9.0863 15.0702 8.2296 15.6708L6.6872 16.752C5.3971 17.6563 4.7521 18.1084 4.2511 17.8397 3.75 17.571 3.75 16.7728 3.75 15.1767Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const BookmarkIcon = createLucideIcon('BookmarkIcon', bookmarkIcon, undefined, '0 0 20 20');

export default BookmarkIcon;
