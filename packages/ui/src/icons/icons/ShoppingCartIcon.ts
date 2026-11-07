import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const shoppingCartIcon: IconNode = [
  [
    'path',
    {
      d: 'M8.75 16.875C8.75 17.2202 8.4702 17.5 8.125 17.5 7.7798 17.5 7.5 17.2202 7.5 16.875 7.5 16.5298 7.7798 16.25 8.125 16.25 8.4702 16.25 8.75 16.5298 8.75 16.875Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M15.8333 16.875C15.8333 17.2202 15.5535 17.5 15.2083 17.5 14.8632 17.5 14.5833 17.2202 14.5833 16.875 14.5833 16.5298 14.8632 16.25 15.2083 16.25 15.5535 16.25 15.8333 16.5298 15.8333 16.875Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M1.6667 2.5H1.8389C2.9427 2.5 3.4946 2.5 3.8546 2.8352 4.2146 3.1703 4.2539 3.7209 4.3325 4.8219L4.542 7.7541C4.6603 9.4113 4.7195 10.2399 4.9706 10.9134 5.5211 12.3897 6.7352 13.5203 8.2471 13.9642 8.9367 14.1667 9.7722 14.1667 11.4431 14.1667 13.1978 14.1667 14.075 14.1667 14.7848 13.9513 16.3828 13.4666 17.6333 12.2161 18.118 10.6181 18.3333 9.9083 18.3333 9.0361 18.3333 7.2917 18.3333 6.7102 18.3333 6.4194 18.2616 6.1829 18.1 5.6502 17.6832 5.2334 17.1505 5.0718 16.9139 5 16.6232 5 16.0417 5H4.5833',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M13.3333 8.3333V10.8333M9.1667 8.3333V10.8333',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const ShoppingCartIcon = createLucideIcon(
  'ShoppingCartIcon',
  shoppingCartIcon,
  undefined,
  '0 0 20 20',
);

export default ShoppingCartIcon;
