import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const percentIcon: IconNode = [
  [
    'path',
    {
      d: 'M3.3333 16.6667L16.6667 3.3333',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M6.8898 3.9435C7.7034 4.7571 7.7034 6.0762 6.8898 6.8898 6.0762 7.7034 4.7571 7.7034 3.9435 6.8898 3.1299 6.0762 3.1299 4.7571 3.9435 3.9435 4.7571 3.1299 6.0762 3.1299 6.8898 3.9435Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M16.0565 13.1102C16.8701 13.9238 16.8701 15.2429 16.0565 16.0565 15.2429 16.8701 13.9238 16.8701 13.1102 16.0565 12.2966 15.2429 12.2966 13.9238 13.1102 13.1102 13.9238 12.2966 15.2429 12.2966 16.0565 13.1102Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const PercentIcon = createLucideIcon('PercentIcon', percentIcon, undefined, '0 0 20 20');

export default PercentIcon;
