import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const timelineIcon: IconNode = [
  ['path', { d: 'M2.5 5.8335H10.8333', strokeLinecap: 'round', strokeLinejoin: 'round' }],
  ['path', { d: 'M5.83331 10H15', strokeLinecap: 'round', strokeLinejoin: 'round' }],
  ['path', { d: 'M9.16669 14.1665H17.5', strokeLinecap: 'round', strokeLinejoin: 'round' }],
];

const TimelineIcon = createLucideIcon('TimelineIcon', timelineIcon, undefined, '0 0 20 20');

export default TimelineIcon;
