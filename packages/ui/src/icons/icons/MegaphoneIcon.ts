import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const megaphoneIcon: IconNode = [
  [
    'path',
    {
      d: 'M7.9167 6.2488C6.8716 6.3113 5.8294 6.3391 4.6804 6.4183 2.9335 6.5387 1.6667 7.9485 1.6667 9.5833 1.6667 11.2182 2.9335 12.628 4.6804 12.7483 5.8294 12.8275 6.8716 12.8553 7.9167 12.9179 11.2115 13.1153 13.9304 15.1361 16.3333 16.8468 16.5495 17.0008 16.8139 17.0834 17.0859 17.0833 17.7749 17.0832 18.3333 16.5618 18.3333 15.9187V3.2479C18.3333 2.6049 17.7749 2.0835 17.0859 2.0833 16.8139 2.0833 16.5495 2.1659 16.3333 2.3198 13.9304 4.0306 11.2115 6.0514 7.9167 6.2488Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M5 12.9167L5.7041 17.1413C5.7787 17.5888 6.1658 17.9167 6.6194 17.9167 6.9115 17.9167 7.1865 17.7792 7.3617 17.5455L7.7981 16.9636C8.1442 16.5021 8.3201 15.9352 8.296 15.3588L7.9313 6.6667',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const MegaphoneIcon = createLucideIcon('MegaphoneIcon', megaphoneIcon, undefined, '0 0 20 20');

export default MegaphoneIcon;
