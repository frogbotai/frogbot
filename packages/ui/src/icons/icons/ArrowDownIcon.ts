import { IconNode } from '../types';
import createLucideIcon from '../createLucideIcon';

export const arrowDownIcon: IconNode = [
  [
    'path',
    {
      d: 'M12.0004 18.3641V3.51483',
      strokeLinecap: 'round'
    }
  ],
  [
    'path',
    {
      d: 'M18.9384 13.2814C18.9384 13.2814 13.7274 19.4519 12.0002 19.4519C10.273 19.4519 5.06209 13.2814 5.06209 13.2814',
      strokeLinecap: 'round',
      strokeLinejoin: 'round'
    }
  ]
];

const ArrowDownIcon = createLucideIcon('ArrowDownIcon', arrowDownIcon);

export default ArrowDownIcon;