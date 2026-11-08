import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const cloudIcon: IconNode = [
  [
    'path',
    {
      d: 'M14.5647 8.7501C14.5708 8.75 14.5771 8.75 14.5833 8.75 16.6544 8.75 18.3333 10.4289 18.3333 12.5 18.3333 14.5711 16.6544 16.25 14.5833 16.25H5.8333C3.5322 16.25 1.6667 14.3845 1.6667 12.0834 1.6667 9.9169 3.32 8.1368 5.4337 7.9356M14.5647 8.7501C14.577 8.6128 14.5833 8.4738 14.5833 8.3334 14.5833 5.8021 12.5313 3.75 10 3.75 7.6027 3.75 5.6353 5.5905 5.4337 7.9356M14.5647 8.7501C14.4794 9.6955 14.1072 10.558 13.5357 11.25M5.4337 7.9356C5.5652 7.9231 5.6985 7.9167 5.8333 7.9167 6.7715 7.9167 7.6373 8.2268 8.3338 8.75',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const CloudIcon = createLucideIcon('CloudIcon', cloudIcon, undefined, '0 0 20 20');

export default CloudIcon;
