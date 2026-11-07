import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const pawnIcon: IconNode = [
  [
    'path',
    {
      d: 'M7.9167 8.3333C7.9167 10.5556 7.5 12.7777 5.8333 15M12.0833 8.3333C12.0833 10.5556 12.5 12.7777 14.1667 15',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M12.9167 4.5238C12.9167 5.1562 12.7069 5.7406 12.3519 6.2139 12.0647 6.5968 11.7783 6.6667 11.3087 6.6667H8.6913C8.2217 6.6667 7.9353 6.5968 7.6481 6.2139 7.2931 5.7406 7.0833 5.1562 7.0833 4.5238 7.0833 2.9459 8.3892 1.6667 10 1.6667 11.6108 1.6667 12.9167 2.9459 12.9167 4.5238Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M6.6667 8.3333H13.3333',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M3.5041 17.2074L3.5214 17.1629C4.2222 15.3665 4.7723 15 6.7682 15H13.2317C15.2277 15 15.7777 15.3665 16.4786 17.1629L16.4959 17.2074C16.849 18.1125 16.6898 18.3333 15.6843 18.3333H4.3158C3.3102 18.3333 3.151 18.1125 3.5041 17.2074Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const PawnIcon = createLucideIcon('PawnIcon', pawnIcon, undefined, '0 0 20 20');

export default PawnIcon;
