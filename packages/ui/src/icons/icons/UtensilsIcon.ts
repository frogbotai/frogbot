import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const utensilsIcon: IconNode = [
  [
    'path',
    {
      d: 'M12.5 8.3333L3.3333 17.5008',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M14.9999 2.5008L12.4999 5.0008C12.0456 5.4552 11.8184 5.6824 11.6969 5.9275 11.4658 6.3938 11.4658 6.9412 11.6969 7.4075 11.8184 7.6526 12.0456 7.8798 12.4999 8.3342 12.9543 8.7885 13.1815 9.0158 13.4266 9.1372 13.8929 9.3682 14.4403 9.3682 14.9067 9.1372 15.1517 9.0158 15.3789 8.7885 15.8333 8.3342L18.3332 5.8342',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M16.6667 4.1658L14.1667 6.6658',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M7.3706 8.2048C6.2331 9.3423 4.6731 9.6267 3.2512 8.2048 1.8293 6.7828 1.0838 4.193 2.2214 3.0555 3.3589 1.918 5.9487 2.6634 7.3706 4.0854 8.7925 5.5072 8.5082 7.0672 7.3706 8.2048ZM7.3706 8.2048L16.6667 17.5008',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const UtensilsIcon = createLucideIcon('UtensilsIcon', utensilsIcon, undefined, '0 0 20 20');

export default UtensilsIcon;
