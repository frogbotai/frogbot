import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const userShieldIcon: IconNode = [
  [
    'path',
    {
      d: 'M9.9958 11.3053L9.1667 11.25C8.8705 11.2581 8.5945 11.2688 8.334 11.2816 5.25 11.4328 2.7368 14.0048 2.5 17.0835',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M5.8333 5.4167A3.3333 3.3333 0 1 0 12.5 5.4167 3.3333 3.3333 0 1 0 5.8333 5.4167Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M17.5 14.5581V13.5333C17.5 13.0567 17.1235 12.6769 16.6714 12.5879 16.1934 12.4938 15.7889 12.3348 15.4977 12.1951 15.1872 12.0461 14.8128 12.0461 14.5023 12.1951 14.2111 12.3348 13.8066 12.4938 13.3286 12.5879 12.8765 12.6769 12.5 13.0567 12.5 13.5333V14.5581C12.5 16.7084 14.155 17.609 14.7718 17.87 14.9188 17.9322 15.0812 17.9322 15.2282 17.87 15.845 17.609 17.5 16.7084 17.5 14.5581Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const UserShieldIcon = createLucideIcon('UserShieldIcon', userShieldIcon, undefined, '0 0 20 20');

export default UserShieldIcon;
