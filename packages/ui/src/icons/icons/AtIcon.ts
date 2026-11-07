import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const atIcon: IconNode = [
  [
    'path',
    {
      d: 'M13 7.0003V10.7502C13 11.9929 14.0073 13.0003 15.25 13.0003 16.4927 13.0003 17.5 11.9929 17.5 10.7502V10C17.5 5.8579 14.1422 2.5 10 2.5 5.8579 2.5 2.5 5.8579 2.5 10 2.5 14.1422 5.8579 17.5 10 17.5 11.6888 17.5 13.2471 16.9418 14.5008 16M13 10.0002C13 11.6572 11.6568 13.0003 10 13.0003 8.3432 13.0003 7 11.6572 7 10.0002 7 8.3434 8.3432 7.0003 10 7.0003 11.6568 7.0003 13 8.3434 13 10.0002Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const AtIcon = createLucideIcon('AtIcon', atIcon, undefined, '0 0 20 20');

export default AtIcon;
