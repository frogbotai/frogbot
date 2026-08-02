import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const arrowUpFilledIcon: IconNode = [
  [
    'path',
    {
      d: 'M8 14C8 14 10.9459 10 12 10C13.0541 10 16 14 16 14',
      fill: 'currentColor',
    },
  ],
  [
    'path',
    {
      d: 'M8 14C8 14 10.9459 10 12 10C13.0541 10 16 14 16 14L8 14Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      fill: 'currentColor',
    },
  ],
]

const ArrowUpFilledIcon = createLucideIcon('ArrowUpFilled', arrowUpFilledIcon)

export default ArrowUpFilledIcon
