import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const workflowIcon: IconNode = [
  [
    'path',
    {
      d: 'M2.5 3.3333C2.5 1.9544 2.7878 1.6667 4.1667 1.6667H7.5C8.8789 1.6667 9.1667 1.9544 9.1667 3.3333 9.1667 4.7122 8.8789 5 7.5 5H4.1667C2.7878 5 2.5 4.7122 2.5 3.3333Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M10.8333 10.8333C10.8333 9.4544 11.1211 9.1667 12.5 9.1667H15.8333C17.2123 9.1667 17.5 9.4544 17.5 10.8333 17.5 12.2123 17.2123 12.5 15.8333 12.5H12.5C11.1211 12.5 10.8333 12.2123 10.8333 10.8333Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M3.3333 16.6667C3.3333 15.2878 3.6211 15 5 15H8.3333C9.7123 15 10 15.2878 10 16.6667 10 18.0456 9.7123 18.3333 8.3333 18.3333H5C3.6211 18.3333 3.3333 18.0456 3.3333 16.6667Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M14.1667 9.1667C14.1667 8.7794 14.1667 8.5858 14.1347 8.4248 14.0032 7.7637 13.4863 7.2469 12.8252 7.1154 12.6642 7.0833 12.4706 7.0833 12.0833 7.0833H7.9167C7.5294 7.0833 7.3359 7.0833 7.1748 7.0513 6.5137 6.9198 5.9969 6.403 5.8654 5.7418 5.8333 5.5808 5.8333 5.3872 5.8333 5',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M14.1667 12.5V13.3333C14.1667 14.9047 14.1667 15.6903 13.6785 16.1785 13.1903 16.6667 12.4047 16.6667 10.8333 16.6667H10',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const WorkflowIcon = createLucideIcon('WorkflowIcon', workflowIcon, undefined, '0 0 20 20');

export default WorkflowIcon;
