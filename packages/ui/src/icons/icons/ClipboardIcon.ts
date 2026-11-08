import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const clipboardIcon: IconNode = [
  [
    'path',
    {
      d: 'M12.0801 1.6669H7.9134C7.2231 1.6669 6.6634 2.2265 6.6634 2.9169 6.6634 3.6073 7.2231 4.1669 7.9134 4.1669H12.0801C12.7704 4.1669 13.3301 3.6073 13.3301 2.9169 13.3301 2.2265 12.7704 1.6669 12.0801 1.6669Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M6.6634 12.5002H9.5206M6.6634 9.1669H13.3301',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M13.3301 2.9169C14.6247 2.9559 15.3967 3.1003 15.9312 3.6347 16.6634 4.3669 16.6634 5.5454 16.6634 7.9024L16.6634 13.3331C16.6634 15.6902 16.6634 16.8687 15.9312 17.6009 15.1989 18.3331 14.0204 18.3331 11.6634 18.3331L8.3301 18.3331C5.9731 18.3331 4.7946 18.3331 4.0623 17.6009 3.3301 16.8687 3.3301 15.6902 3.3301 13.3332L3.3301 7.9025C3.3301 5.5454 3.3301 4.3669 4.0623 3.6347 4.5967 3.1003 5.3688 2.9559 6.6633 2.9169',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const ClipboardIcon = createLucideIcon('ClipboardIcon', clipboardIcon, undefined, '0 0 20 20');

export default ClipboardIcon;
