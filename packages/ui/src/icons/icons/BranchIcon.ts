import createLucideIcon from '../createLucideIcon';
import type { IconNode } from '../types';

export const branchIcon: IconNode = [
  ['circle', { cx: '6', cy: '5', r: '2' }],
  ['circle', { cx: '18', cy: '6', r: '2' }],
  ['circle', { cx: '6', cy: '19', r: '2' }],
  ['path', { d: 'M6 7v10M8 9h4a6 6 0 0 0 6-6' }],
];

const BranchIcon = createLucideIcon('BranchIcon', branchIcon, 1.5);

export default BranchIcon;
