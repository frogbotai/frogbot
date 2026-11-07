import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const idCardIcon: IconNode = [
  [
    'path',
    {
      d: 'M13.3333 7.5H15.8333',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M13.3333 10.8333H15.8333',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M4.165 13.8348C4.4078 13.1039 4.8589 12.4709 5.456 12.0231 6.0531 11.5753 6.7667 11.3348 7.4984 11.3348 8.2301 11.3348 8.9437 11.5753 9.5408 12.0231 10.1378 12.4709 10.5889 13.1039 10.8318 13.8348',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M9.1243 7.832C9.1243 8.7525 8.3782 9.4987 7.4577 9.4987 6.5372 9.4987 5.791 8.7525 5.791 7.832 5.791 6.9116 6.5372 6.1654 7.4577 6.1654 8.3782 6.1654 9.1243 6.9116 9.1243 7.832Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M7.5 3.3333H12.5C15.2498 3.3333 16.6248 3.3333 17.4791 4.1876 18.3333 5.0419 18.3333 6.4168 18.3333 9.1667V10.8333C18.3333 13.5832 18.3333 14.9581 17.4791 15.8124 16.6248 16.6667 15.2498 16.6667 12.5 16.6667H7.5C4.7501 16.6667 3.3752 16.6667 2.5209 15.8124 1.6667 14.9581 1.6667 13.5832 1.6667 10.8333V9.1667C1.6667 6.4168 1.6667 5.0419 2.5209 4.1876 3.3752 3.3333 4.7501 3.3333 7.5 3.3333Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const IdCardIcon = createLucideIcon('IdCardIcon', idCardIcon, undefined, '0 0 20 20');

export default IdCardIcon;
