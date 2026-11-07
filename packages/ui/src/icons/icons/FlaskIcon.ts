import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const flaskIcon: IconNode = [
  [
    'path',
    {
      d: 'M12.0811 1.6667V6.8783C12.0811 7.2718 12.2578 7.6445 12.5623 7.8937L13.1184 8.3487C15.3931 10.2098 16.8564 12.8814 17.1998 15.8003 17.3584 17.1487 16.3049 18.3333 14.9473 18.3333H5.0482C3.6906 18.3333 2.6372 17.1487 2.7958 15.8003 3.1392 12.8814 4.6025 10.2098 6.8772 8.3487L7.4333 7.8937C7.7378 7.6445 7.9144 7.2718 7.9144 6.8783V1.6667',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M6.6642 1.6667H13.3309',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M4.5809 11.6819C4.7841 11.6719 4.9923 11.6667 5.2059 11.6667 8.3309 11.6667 11.4559 14.1667 14.5809 14.1667 15.2274 14.1667 15.7777 14.1153 16.2476 14.0278',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const FlaskIcon = createLucideIcon('FlaskIcon', flaskIcon, undefined, '0 0 20 20');

export default FlaskIcon;
