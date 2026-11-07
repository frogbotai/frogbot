import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const buildingIcon: IconNode = [
  [
    'path',
    {
      d: 'M10 1.6667H5C2.9317 1.6667 2.5 2.0983 2.5 4.1667V18.3333H12.5V4.1667C12.5 2.0983 12.0683 1.6667 10 1.6667Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M15 6.6667H12.5V18.3333H17.5V9.1667C17.5 7.0983 17.0683 6.6667 15 6.6667Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M6.6667 5L8.3333 5M6.6667 7.5L8.3333 7.5M6.6667 10L8.3333 10',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M9.5833 18.3333V15C9.5833 14.2143 9.5833 13.8215 9.3393 13.5774 9.0952 13.3333 8.7023 13.3333 7.9167 13.3333H7.0833C6.2977 13.3333 5.9048 13.3333 5.6607 13.5774 5.4167 13.8215 5.4167 14.2143 5.4167 15V18.3333',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const BuildingIcon = createLucideIcon('BuildingIcon', buildingIcon, undefined, '0 0 20 20');

export default BuildingIcon;
