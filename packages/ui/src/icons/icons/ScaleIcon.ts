import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const scaleIcon: IconNode = [
  [
    'path',
    {
      d: 'M17.5 14.1667L15 8.3333 12.5 14.1667',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M7.5 14.1667L5 8.3333 2.5 14.1667',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M3.3333 8.3333H4.2068C5.2597 8.3333 6.2813 7.7456 7.1034 6.6667 8.7968 4.4444 11.2032 4.4444 12.8966 6.6667 13.7188 7.7456 14.7403 8.3333 15.7932 8.3333H16.6667',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M15 18.3333C16.3003 18.3333 17.4318 17.4569 18.0151 16.1645 18.3089 15.5134 18.4558 15.1879 18.2063 14.6773 17.9569 14.1667 17.5437 14.1667 16.7175 14.1667H13.2825C12.4563 14.1667 12.0431 14.1667 11.7937 14.6773 11.5442 15.1879 11.6911 15.5134 11.9849 16.1645 12.5682 17.4569 13.6997 18.3333 15 18.3333Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M5 18.3333C6.3003 18.3333 7.4318 17.4569 8.0151 16.1645 8.3089 15.5134 8.4558 15.1879 8.2064 14.6773 7.9569 14.1667 7.5438 14.1667 6.7175 14.1667H3.2825C2.4562 14.1667 2.0431 14.1667 1.7936 14.6773 1.5442 15.1879 1.6911 15.5134 1.9849 16.1645 2.5682 17.4569 3.6997 18.3333 5 18.3333Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M11.6667 3.3333C11.6667 4.2538 10.9205 5 10 5 9.0795 5 8.3333 4.2538 8.3333 3.3333 8.3333 2.4129 9.0795 1.6667 10 1.6667 10.9205 1.6667 11.6667 2.4129 11.6667 3.3333Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const ScaleIcon = createLucideIcon('ScaleIcon', scaleIcon, undefined, '0 0 20 20');

export default ScaleIcon;
