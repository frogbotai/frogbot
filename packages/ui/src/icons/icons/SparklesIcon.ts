import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const sparklesIcon: IconNode = [
  [
    'path',
    {
      d: 'M12.5 1.6667L12.9489 3.6596C13.3298 5.3501 14.6498 6.6703 16.3403 7.0511L18.3333 7.5 16.3403 7.9489C14.6498 8.3297 13.3298 9.6498 12.9489 11.3403L12.5 13.3333 12.0511 11.3403C11.6703 9.6498 10.3502 8.3297 8.6597 7.9489L6.6667 7.5 8.6597 7.0511C10.3501 6.6703 11.6703 5.3501 12.0511 3.6597L12.5 1.6667Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M5.8333 10L6.154 11.4236C6.426 12.631 7.369 13.574 8.5764 13.846L10 14.1667 8.5764 14.4873C7.369 14.7593 6.426 15.7023 6.154 16.9097L5.8333 18.3333 5.5127 16.9097C5.2407 15.7023 4.2977 14.7593 3.0902 14.4873L1.6667 14.1667 3.0902 13.846C4.2977 13.574 5.2407 12.6311 5.5127 11.4236L5.8333 10Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const SparklesIcon = createLucideIcon('SparklesIcon', sparklesIcon, undefined, '0 0 20 20');

export default SparklesIcon;
