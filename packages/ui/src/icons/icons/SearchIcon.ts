import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const searchIcon: IconNode = [
  [
    'path',
    {
      d: 'M14.1667 14.1667L17.5 17.5',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M15.8333 9.1667C15.8333 5.4848 12.8486 2.5 9.1667 2.5 5.4848 2.5 2.5 5.4848 2.5 9.1667 2.5 12.8486 5.4848 15.8333 9.1667 15.8333 12.8486 15.8333 15.8333 12.8486 15.8333 9.1667Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const SearchIcon = createLucideIcon('SearchIcon', searchIcon, undefined, '0 0 20 20');

export default SearchIcon;
