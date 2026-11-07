import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const newspaperIcon: IconNode = [
  [
    'path',
    {
      d: 'M14.5833 8.3333V7.5C14.5833 5.143 14.5833 3.9645 13.8511 3.2322 13.1188 2.5 11.9403 2.5 9.5833 2.5H7.0833C4.7263 2.5 3.5478 2.5 2.8156 3.2322 2.0833 3.9645 2.0833 5.143 2.0833 7.5V12.5C2.0833 14.857 2.0833 16.0355 2.8156 16.7678 3.5478 17.5 4.7263 17.5 7.0833 17.5H16.25',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M5.4167 6.6667H11.25M5.4167 10L11.25 10M5.4167 13.3333H8.75',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M14.5833 8.3333V15.8333C14.5833 16.7538 15.3295 17.5 16.25 17.5 17.1705 17.5 17.9167 16.7538 17.9167 15.8333V11.6667C17.9167 10.4999 17.9167 9.9165 17.6896 9.4708 17.4898 9.0788 17.1712 8.7602 16.7792 8.5604 16.3335 8.3333 15.7501 8.3333 14.5833 8.3333Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const NewspaperIcon = createLucideIcon('NewspaperIcon', newspaperIcon, undefined, '0 0 20 20');

export default NewspaperIcon;
