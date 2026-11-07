import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const qrCodeIcon: IconNode = [
  [
    'path',
    {
      d: 'M2.5 5C2.5 3.8215 2.5 3.2323 2.8661 2.8661 3.2323 2.5 3.8215 2.5 5 2.5 6.1785 2.5 6.7678 2.5 7.1339 2.8661 7.5 3.2323 7.5 3.8215 7.5 5 7.5 6.1785 7.5 6.7678 7.1339 7.1339 6.7678 7.5 6.1785 7.5 5 7.5 3.8215 7.5 3.2323 7.5 2.8661 7.1339 2.5 6.7678 2.5 6.1785 2.5 5Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M12.5 5C12.5 3.8215 12.5 3.2323 12.8661 2.8661 13.2323 2.5 13.8215 2.5 15 2.5 16.1785 2.5 16.7677 2.5 17.1339 2.8661 17.5 3.2323 17.5 3.8215 17.5 5 17.5 6.1785 17.5 6.7678 17.1339 7.1339 16.7677 7.5 16.1785 7.5 15 7.5 13.8215 7.5 13.2323 7.5 12.8661 7.1339 12.5 6.7678 12.5 6.1785 12.5 5Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M2.5 15C2.5 13.8215 2.5 13.2323 2.8661 12.8661 3.2323 12.5 3.8215 12.5 5 12.5 6.1785 12.5 6.7678 12.5 7.1339 12.8661 7.5 13.2323 7.5 13.8215 7.5 15 7.5 16.1785 7.5 16.7677 7.1339 17.1339 6.7678 17.5 6.1785 17.5 5 17.5 3.8215 17.5 3.2323 17.5 2.8661 17.1339 2.5 16.7677 2.5 16.1785 2.5 15Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M12.5 12.5H12.5083',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M17.5 12.5V17.5H12.5',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const QrCodeIcon = createLucideIcon('QrCodeIcon', qrCodeIcon, undefined, '0 0 20 20');

export default QrCodeIcon;
