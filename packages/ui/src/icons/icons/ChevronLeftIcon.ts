import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const chevronLeftIcon: IconNode = [
  [
    'path',
    {
      d: 'M9.00005 6C9.00005 6 3 10.4188 3 12C3 13.5811 9 18 9 18',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
]

const ChevronLeftIcon = createLucideIcon('ChevronLeftIcon', chevronLeftIcon)

export default ChevronLeftIcon
