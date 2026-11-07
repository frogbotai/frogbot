import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const paletteIcon: IconNode = [
  [
    'path',
    {
      d: 'M18.3333 10C18.3333 5.3976 14.6023 1.6667 10 1.6667 5.3976 1.6667 1.6667 5.3976 1.6667 10 1.6667 14.6023 5.3976 18.3333 10 18.3333 10.7014 18.3333 11.6667 18.4303 11.6667 17.5 11.6667 16.9925 11.4027 16.601 11.1405 16.212 10.7568 15.6429 10.3769 15.0794 10.8333 14.1667 11.3889 13.0556 12.3148 13.0556 13.7346 13.0556 14.4445 13.0556 15.2778 13.0556 16.25 12.9167 18.0008 12.6666 18.3333 11.5903 18.3333 10Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M6.6667 7.0833A1.25 1.25 0 1 0 9.1667 7.0833 1.25 1.25 0 1 0 6.6667 7.0833Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M12.5 7.9167A1.25 1.25 0 1 0 15 7.9167 1.25 1.25 0 1 0 12.5 7.9167Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M5.9375 12.5H5.8333M6.0417 12.5C6.0417 12.6151 5.9484 12.7083 5.8333 12.7083 5.7183 12.7083 5.625 12.6151 5.625 12.5 5.625 12.3849 5.7183 12.2917 5.8333 12.2917 5.9484 12.2917 6.0417 12.3849 6.0417 12.5Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const PaletteIcon = createLucideIcon('PaletteIcon', paletteIcon, undefined, '0 0 20 20');

export default PaletteIcon;
