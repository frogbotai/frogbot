import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const bugIcon: IconNode = [
  [
    'path',
    {
      d: 'M2.5109 4.159C2.411 5.0424 2.9604 7.019 5.4077 7.019',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M14.6626 6.984C15.6964 7.149 17.5943 6.249 17.4964 4.169',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M17.494 17.4991C17.544 16.6191 16.8148 14.6291 14.6658 14.5191',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M5.3764 14.559C4.7084 14.359 2.5109 15.279 2.5109 17.499',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M7.7749 5.099C7.7949 4.249 8.2044 2.499 10.0024 2.499 11.6007 2.499 12.1551 3.849 12.23 5.099M5.2178 7.849C5.3176 7.199 6.0768 5.679 7.8049 5.529 9.5529 5.463 11.9503 5.489 12.3998 5.559 12.9891 5.6115 14.4126 6.199 14.7922 7.849 14.927 8.699 14.8571 9.899 14.877 10.599 14.8471 11.299 14.9339 12.7186 14.7971 13.449 14.6973 14.249 14.1578 15.389 13.4187 16.089 12.3198 17.269 9.3033 18.509 6.6961 16.209 5.3476 14.909 5.2577 13.649 5.1578 13.149 5.131 12.8809 5.1323 11.5636 5.1378 10.299 5.1179 9.205 5.1436 8.1505 5.2178 7.849Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M10.0028 13.749L10.0028 16.899',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const BugIcon = createLucideIcon('BugIcon', bugIcon, undefined, '0 0 20 20');

export default BugIcon;
