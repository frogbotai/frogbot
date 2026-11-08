import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const sidebarRightIcon: IconNode = [
  [
    'path',
    {
      d: 'M1.6667 10C1.6667 6.9257 1.6667 5.3886 2.3449 4.299C2.5958 3.8958 2.9074 3.5452 3.2658 3.263C4.2343 2.5 5.6006 2.5 8.3333 2.5H11.6667C14.3993 2.5 15.7657 2.5 16.7342 3.263C17.0926 3.5452 17.4043 3.8958 17.6552 4.299C18.3333 5.3886 18.3333 6.9257 18.3333 10C18.3333 13.0742 18.3333 14.6114 17.6552 15.701C17.4043 16.1042 17.0926 16.4548 16.7342 16.7371C15.7657 17.5 14.3993 17.5 11.6667 17.5H8.3333C5.6006 17.5 4.2343 17.5 3.2658 16.7371C2.9074 16.4548 2.5958 16.1042 2.3449 15.701C1.6667 14.6114 1.6667 13.0742 1.6667 10Z',
    },
  ],
  [
    'path',
    {
      d: 'M12.0833 2.5V17.5',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M15 5.8333H15.8333M15 8.3333H15.8333',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const SidebarRightIcon = createLucideIcon(
  'SidebarRightIcon',
  sidebarRightIcon,
  undefined,
  '0 0 20 20',
);

export default SidebarRightIcon;
