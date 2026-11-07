import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const buildingIcon: IconNode = [
  [
    'path',
    {
      d: 'M13.3333 8.3333L15.1245 8.8707C16.2688 9.214 16.841 9.3857 17.1705 9.8285 17.5 10.2713 17.5 10.8688 17.5 12.0634V18.3333',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M6.6667 7.5L9.1667 7.5M6.6667 10.8333L9.1667 10.8333',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M10 18.3333V15.8333C10 15.0477 10 14.6548 9.7559 14.4108 9.5118 14.1667 9.119 14.1667 8.3333 14.1667H7.5C6.7143 14.1667 6.3215 14.1667 6.0774 14.4108 5.8333 14.6548 5.8333 15.0477 5.8333 15.8333V18.3333',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M1.6667 18.3333L18.3333 18.3333',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M2.5 18.3333V5.5977C2.5 3.5054 2.5 2.4593 3.1593 1.9402 3.8186 1.4211 4.7895 1.703 6.7313 2.2666L10.8979 3.476C12.0697 3.8161 12.6556 3.9862 12.9944 4.4497 13.3333 4.9132 13.3333 5.5445 13.3333 6.8071V18.3333',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const BuildingIcon = createLucideIcon('BuildingIcon', buildingIcon, undefined, '0 0 20 20');

export default BuildingIcon;
