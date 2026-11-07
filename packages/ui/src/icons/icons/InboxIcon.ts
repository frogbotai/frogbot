import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const inboxIcon: IconNode = [
  [
    'path',
    {
      d: 'M2.0833 10C2.0833 6.268 2.0833 4.4021 3.2427 3.2427 4.4021 2.0833 6.268 2.0833 10 2.0833 13.7319 2.0833 15.5979 2.0833 16.7573 3.2427 17.9167 4.4021 17.9167 6.268 17.9167 10 17.9167 13.7319 17.9167 15.5979 16.7573 16.7573 15.5979 17.9167 13.7319 17.9167 10 17.9167 6.268 17.9167 4.4021 17.9167 3.2427 16.7573 2.0833 15.5979 2.0833 13.7319 2.0833 10Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M17.9167 11.25H13.8119C13.1102 11.25 12.5588 11.8363 12.2496 12.456 11.9136 13.1293 11.2408 13.75 10 13.75 8.7593 13.75 8.0864 13.1293 7.7504 12.456 7.4412 11.8363 6.8898 11.25 6.188 11.25H2.0833',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const InboxIcon = createLucideIcon('InboxIcon', inboxIcon, undefined, '0 0 20 20');

export default InboxIcon;
