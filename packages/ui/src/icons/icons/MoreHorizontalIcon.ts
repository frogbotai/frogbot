import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const moreHorizontalIcon: IconNode = [
  [
    'path',
    {
      d: 'M11.9958 12H12.0048',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M17.9998 12H18.0088',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M5.99976 12H6.00874',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
]

const MoreHorizontalIcon = createLucideIcon('MoreHorizontal', moreHorizontalIcon)

export default MoreHorizontalIcon