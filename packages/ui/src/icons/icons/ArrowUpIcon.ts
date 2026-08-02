import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const arrowUpIcon: IconNode = [
  [
    'path',
    {
      d: 'M11.9998 5.63593V20.4852',
      strokeLinecap: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M5.06183 10.7186C5.06183 10.7186 10.2728 4.54812 12 4.54812C13.7273 4.54805 18.9382 10.7186 18.9382 10.7186',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
]

const ArrowUpIcon = createLucideIcon('ArrowUp', arrowUpIcon)

export default ArrowUpIcon