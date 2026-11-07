import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const eyeIcon: IconNode = [
  [
    'path',
    {
      d: 'M17.9533 9.2042C18.2067 9.5594 18.3333 9.7371 18.3333 10 18.3333 10.2629 18.2067 10.4406 17.9533 10.7958 16.8149 12.3922 13.9077 15.8333 10 15.8333 6.0923 15.8333 3.1851 12.3922 2.0467 10.7958 1.7933 10.4406 1.6667 10.2629 1.6667 10 1.6667 9.7371 1.7933 9.5594 2.0467 9.2042 3.1851 7.6079 6.0923 4.1667 10 4.1667 13.9077 4.1667 16.8149 7.6079 17.9533 9.2042Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M12.5 10C12.5 8.6193 11.3808 7.5 10 7.5 8.6193 7.5 7.5 8.6193 7.5 10 7.5 11.3808 8.6193 12.5 10 12.5 11.3808 12.5 12.5 11.3808 12.5 10Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const EyeIcon = createLucideIcon('EyeIcon', eyeIcon, undefined, '0 0 20 20');

export default EyeIcon;
