import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const mailIcon: IconNode = [
  [
    'path',
    {
      d: 'M6.6667 16.6667H13.3333C15.6903 16.6667 16.8688 16.6667 17.6011 15.9344 18.3333 15.2022 18.3333 14.0237 18.3333 11.6667V8.3333C18.3333 5.9763 18.3333 4.7978 17.6011 4.0656 16.8688 3.3333 15.6903 3.3333 13.3333 3.3333H6.6667C4.3096 3.3333 3.1311 3.3333 2.3989 4.0656 1.6667 4.7978 1.6667 5.9763 1.6667 8.3333V11.6667C1.6667 14.0237 1.6667 15.2022 2.3989 15.9344 3.1311 16.6667 4.3096 16.6667 6.6667 16.6667Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M5 7.0833L9.1603 9.7768C9.6792 10.0795 10.3208 10.0795 10.8398 9.7768L15 7.0833',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const MailIcon = createLucideIcon('MailIcon', mailIcon, undefined, '0 0 20 20');

export default MailIcon;
