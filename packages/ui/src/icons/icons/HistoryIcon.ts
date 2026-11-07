import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const historyIcon: IconNode = [
  [
    'path',
    {
      d: 'M2.9158 12.4713C3.9373 15.3993 6.7229 17.5 9.9992 17.5 14.1413 17.5 17.4992 14.1422 17.4992 10 17.4992 5.8579 14.1413 2.5 9.9992 2.5 6.9152 2.5 4.082 4.7297 3.0745 7.0833',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M9.9992 5.8333V10L12.4992 11.6667',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M6.2479 7.2864C6.2479 7.2864 3.1782 7.7522 2.7124 7.2863 2.2465 6.8205 2.7124 3.7508 2.7124 3.7508',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const HistoryIcon = createLucideIcon('HistoryIcon', historyIcon, undefined, '0 0 20 20');

export default HistoryIcon;
