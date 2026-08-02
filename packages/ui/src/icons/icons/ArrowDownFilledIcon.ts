import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const arrowDownFilledIcon: IconNode = [
  [
    'path',
    {
      d: 'M16 10C16 10 13.0541 14 12 14C10.9459 14 8 10 8 10',
      fill: 'currentColor',
    },
  ],
  [
    'path',
    {
      d: 'M16 10C16 10 13.0541 14 12 14C10.9459 14 8 10 8 10L16 10Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      fill: 'currentColor',
    },
  ],
]

const ArrowDownFilledIcon = createLucideIcon('ArrowDownFilledIcon', arrowDownFilledIcon)

export default ArrowDownFilledIcon
