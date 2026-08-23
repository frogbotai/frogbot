import createLucideIcon from '../createLucideIcon';
import type { IconNode } from '../types';

export const checkIcon: IconNode = [['path', { d: 'M20 6 9 17l-5-5' }]];

const CheckIcon = createLucideIcon('CheckIcon', checkIcon);

export default CheckIcon;
