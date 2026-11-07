import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const calendarIcon: IconNode = [
  [
    'path',
    {
      d: 'M13.3333 1.6667V5M6.6667 1.6667V5',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M10.8333 3.3333H9.1667C6.024 3.3333 4.4526 3.3333 3.4763 4.3096 2.5 5.286 2.5 6.8573 2.5 10V11.6667C2.5 14.8093 2.5 16.3808 3.4763 17.357 4.4526 18.3333 6.024 18.3333 9.1667 18.3333H10.8333C13.976 18.3333 15.5474 18.3333 16.5237 17.357 17.5 16.3808 17.5 14.8093 17.5 11.6667V10C17.5 6.8573 17.5 5.286 16.5237 4.3096 15.5474 3.3333 13.976 3.3333 10.8333 3.3333Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M2.5 8.3333H17.5',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const CalendarIcon = createLucideIcon('CalendarIcon', calendarIcon, undefined, '0 0 20 20');

export default CalendarIcon;
