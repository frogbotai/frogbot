import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const walletIcon: IconNode = [
  [
    'path',
    {
      d: 'M4.1667 2.5H11.6667C12.4417 2.5 12.8292 2.5 13.1471 2.5852 14.0097 2.8164 14.6837 3.4902 14.9148 4.3529 15 4.6709 15 5.0584 15 5.8333H4.1667C3.2462 5.8333 2.5 5.0871 2.5 4.1667 2.5 3.2462 3.2462 2.5 4.1667 2.5Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M2.5 4.1667V12.5C2.5 14.857 2.5 16.0355 3.2322 16.7678 3.9645 17.5 5.143 17.5 7.5 17.5H12.5C14.857 17.5 16.0355 17.5 16.7678 16.7678 17.5 16.0355 17.5 14.857 17.5 12.5V10.8333C17.5 8.4763 17.5 7.2978 16.7678 6.5656 16.0355 5.8333 14.857 5.8333 12.5 5.8333H5.8333',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M17.5 10H15.8333C15.4458 10 15.2521 10 15.0932 10.0426 14.6618 10.1582 14.3248 10.4951 14.2093 10.9265 14.1667 11.0854 14.1667 11.2792 14.1667 11.6667 14.1667 12.0542 14.1667 12.2479 14.2093 12.4068 14.3248 12.8383 14.6618 13.1752 15.0932 13.2908 15.2521 13.3333 15.4458 13.3333 15.8333 13.3333H17.5',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const WalletIcon = createLucideIcon('WalletIcon', walletIcon, undefined, '0 0 20 20');

export default WalletIcon;
