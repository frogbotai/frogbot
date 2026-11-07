import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const receiptIcon: IconNode = [
  [
    'path',
    {
      d: 'M3.3333 15.5382V6.7119C3.3333 4.3335 3.3333 3.1444 4.0656 2.4055 4.7978 1.6667 5.9763 1.6667 8.3333 1.6667H11.6667C14.0237 1.6667 15.2022 1.6667 15.9344 2.4055 16.6667 3.1444 16.6667 4.3335 16.6667 6.7119V15.5382C16.6667 16.7979 16.6667 17.4277 16.2817 17.6757 15.6526 18.0809 14.6801 17.2312 14.1909 16.9228 13.7868 16.6678 13.5848 16.5404 13.3604 16.5331 13.1181 16.5251 12.9124 16.6473 12.4758 16.9228L10.8833 17.927C10.4537 18.1978 10.239 18.3333 10 18.3333 9.761 18.3333 9.5463 18.1978 9.1167 17.927L7.5243 16.9228C7.1201 16.6678 6.9181 16.5404 6.6938 16.5331 6.4514 16.5251 6.2458 16.6473 5.8091 16.9228 5.32 17.2312 4.3474 18.0809 3.7183 17.6757 3.3333 17.4277 3.3333 16.7979 3.3333 15.5382Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M9.1667 9.1667H6.6667',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M11.6667 5.8333L6.6667 5.8333',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const ReceiptIcon = createLucideIcon('ReceiptIcon', receiptIcon, undefined, '0 0 20 20');

export default ReceiptIcon;
