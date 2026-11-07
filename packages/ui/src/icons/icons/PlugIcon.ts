import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const plugIcon: IconNode = [
  [
    'path',
    {
      d: 'M7.4935 1.6667V5.8333',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M12.4935 1.6667V5.8333',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M9.9935 15V18.3333',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M4.1602 5.8333H15.8268',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M4.9935 5.8333V8.3333C4.9935 9.6594 5.3058 10.729 6.2435 11.6667 6.3769 11.8001 6.4714 11.9883 6.5376 12.2121 6.9218 13.5109 7.1139 14.1603 7.3586 14.4372 7.5445 14.6475 7.6486 14.7253 7.903 14.8439 8.2378 15 8.6453 15 9.4602 15H10.5268C11.3748 15 11.7988 15 12.1468 14.8287 12.3987 14.7048 12.5264 14.6032 12.7036 14.3854 12.9484 14.0846 13.0924 13.4582 13.3803 12.2053 13.4156 12.0517 13.4638 11.934 13.529 11.8688 14.4667 10.9312 14.9935 9.6594 14.9935 8.3333V5.8333H4.9935Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const PlugIcon = createLucideIcon('PlugIcon', plugIcon, undefined, '0 0 20 20');

export default PlugIcon;
