import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const kanbanIcon: IconNode = [
  [
    'path',
    {
      d: 'M2.5 10C2.5 13.1248 2.5 14.6872 3.2958 15.7824 3.5528 16.1362 3.8638 16.4473 4.2176 16.7043 5.3128 17.5 6.8752 17.5 10 17.5 13.1248 17.5 14.6872 17.5 15.7824 16.7043 16.1362 16.4473 16.4473 16.1362 16.7043 15.7824 17.5 14.6872 17.5 13.1248 17.5 10 17.5 6.8752 17.5 5.3128 16.7043 4.2176 16.4473 3.8638 16.1362 3.5528 15.7824 3.2958 14.6872 2.5 13.1248 2.5 10 2.5 6.8752 2.5 5.3128 2.5 4.2176 3.2958 3.8638 3.5528 3.5528 3.8638 3.2958 4.2176 2.5 5.3128 2.5 6.8752 2.5 10Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M10 5.8333V9.1667M14.1667 5.8333V14.1667M5.8333 5.8333V11.6667',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const KanbanIcon = createLucideIcon('KanbanIcon', kanbanIcon, undefined, '0 0 20 20');

export default KanbanIcon;
