import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const musicIcon: IconNode = [
  [
    'path',
    {
      d: 'M9.1667 5.5306V13.75M9.1667 5.5306C10.744 6.9308 12.1422 7.9201 13.3386 8.4848 13.9114 8.7551 14.4304 8.8068 15.0165 8.546 16.4793 7.8951 17.5 6.4219 17.5 4.7087 15.8929 5.8409 13.9063 5.2263 12.2372 4.1712 10.8712 3.3076 10.1882 2.8758 9.8808 2.9197 9.6484 2.9528 9.5236 3.0201 9.37 3.1951 9.1667 3.4268 9.1667 4.1281 9.1667 5.5306Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M9.1667 13.75C9.1667 15.5909 7.6743 17.0833 5.8333 17.0833 3.9924 17.0833 2.5 15.5909 2.5 13.75 2.5 11.9091 3.9924 10.4166 5.8333 10.4166 7.6743 10.4166 9.1667 11.9091 9.1667 13.75Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const MusicIcon = createLucideIcon('MusicIcon', musicIcon, undefined, '0 0 20 20');

export default MusicIcon;
