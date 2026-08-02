import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const minusIcon: IconNode = [
  [
    'path',
    {
      d: 'M33.3346 20H6.66797',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
]

const MinusIcon = createLucideIcon('MinusIcon', minusIcon, 2.5, '0 0 40 40')

export default MinusIcon
