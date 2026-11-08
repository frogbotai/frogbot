import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const graduationCapIcon: IconNode = [
  [
    'path',
    {
      d: 'M7.9513 3.8767L5.8192 4.9369C3.0509 6.3134 1.6667 7.0017 1.6667 8.125 1.6667 9.2483 3.0509 9.9366 5.8192 11.3131L7.9513 12.3733C8.9592 12.8744 9.4631 13.125 10 13.125 10.5369 13.125 11.0408 12.8744 12.0487 12.3733L14.1807 11.3131C16.9492 9.9366 18.3333 9.2483 18.3333 8.125 18.3333 7.0017 16.9492 6.3134 14.1807 4.9369L12.0487 3.8767C11.0408 3.3756 10.5369 3.125 10 3.125 9.4631 3.125 8.9592 3.3756 7.9513 3.8767Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M5 11.0417V14.2142C5 14.2905 5 14.3287 5.0015 14.3641 5.0258 14.9528 5.351 15.4863 5.8595 15.7717 5.8901 15.7888 5.9237 15.8058 5.9911 15.84 6.2664 15.9796 6.4041 16.0493 6.5371 16.111 8.7364 17.1297 11.2636 17.1297 13.4629 16.111 13.5959 16.0493 13.7336 15.9796 14.0089 15.84 14.0763 15.8058 14.1099 15.7888 14.1405 15.7717 14.649 15.4863 14.9742 14.9528 14.9985 14.3641 15 14.3287 15 14.2905 15 14.2142V11.0417',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M18.3333 8.125V13.5422',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const GraduationCapIcon = createLucideIcon(
  'GraduationCapIcon',
  graduationCapIcon,
  undefined,
  '0 0 20 20',
);

export default GraduationCapIcon;
