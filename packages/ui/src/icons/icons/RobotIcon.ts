import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const robotIcon: IconNode = [
  ['path', { d: 'M10 5V3', strokeLinecap: 'round', strokeLinejoin: 'round' }],
  ['circle', { cx: '10', cy: '11', r: '6', strokeLinecap: 'round', strokeLinejoin: 'round' }],
  ['path', { d: 'M7.9 10.25V11.75', strokeLinecap: 'round', strokeLinejoin: 'round' }],
  ['path', { d: 'M12.1 10.25V11.75', strokeLinecap: 'round', strokeLinejoin: 'round' }],
  ['path', { d: 'M2.75 10V12', strokeLinecap: 'round', strokeLinejoin: 'round' }],
  ['path', { d: 'M17.25 10V12', strokeLinecap: 'round', strokeLinejoin: 'round' }],
];

const RobotIcon = createLucideIcon('RobotIcon', robotIcon, undefined, '0 0 20 20');

export default RobotIcon;
