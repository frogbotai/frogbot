import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const bedIcon: IconNode = [
  [
    'path',
    {
      d: 'M18.3333 14.5833H1.6667',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M18.3333 17.5V13.3333C18.3333 11.762 18.3333 10.9763 17.8452 10.4882 17.357 10 16.5713 10 15 10H5C3.4286 10 2.643 10 2.1548 10.4882 1.6667 10.9763 1.6667 11.762 1.6667 13.3333V17.5',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M13.3333 10V8.8482C13.3333 8.4253 13.2571 8.2838 12.8663 8.1171 12.0526 7.7699 11.0648 7.5 10 7.5 8.9352 7.5 7.9474 7.7699 7.1337 8.1171 6.743 8.2838 6.6667 8.4253 6.6667 8.8482L6.6667 10',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M16.6667 10V6.1338C16.6667 5.5574 16.6667 5.2693 16.5243 4.9971 16.382 4.725 16.1792 4.5841 15.7737 4.3024 14.1384 3.1665 12.1477 2.5 10 2.5 7.8524 2.5 5.8616 3.1665 4.2264 4.3024 3.8208 4.5841 3.618 4.725 3.4757 4.9971 3.3333 5.2693 3.3333 5.5574 3.3333 6.1338V10',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const BedIcon = createLucideIcon('BedIcon', bedIcon, undefined, '0 0 20 20');

export default BedIcon;
