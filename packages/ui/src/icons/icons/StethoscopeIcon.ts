import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const stethoscopeIcon: IconNode = [
  [
    'path',
    {
      d: 'M5.4167 2.9167H3.75C3.2898 2.9167 2.9167 3.2898 2.9167 3.75V6.6667C2.9167 9.198 4.9687 11.25 7.5 11.25 10.0313 11.25 12.0833 9.198 12.0833 6.6667V3.75C12.0833 3.2898 11.7103 2.9167 11.25 2.9167H9.5833',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M15.4167 12.9167V13.9583C15.4167 16.1445 13.6445 17.9167 11.4583 17.9167 9.2722 17.9167 7.5 16.1445 7.5 13.9583V11.25',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M9.5833 2.0833V3.75',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M5.4167 2.0833V3.75',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M17.0833 11.25C17.0833 12.1705 16.3372 12.9167 15.4167 12.9167 14.4962 12.9167 13.75 12.1705 13.75 11.25 13.75 10.3295 14.4962 9.5833 15.4167 9.5833 16.3372 9.5833 17.0833 10.3295 17.0833 11.25Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const StethoscopeIcon = createLucideIcon(
  'StethoscopeIcon',
  stethoscopeIcon,
  undefined,
  '0 0 20 20',
);

export default StethoscopeIcon;
