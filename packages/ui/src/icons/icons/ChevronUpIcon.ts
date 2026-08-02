import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const chevronUpIcon: IconNode = [
  [
    'path',
    {
      d: 'M6 15C6 15 10.4188 9 12 9C13.5811 9 18 15 18 15',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
]

const ChevronUpIcon = createLucideIcon('ChevronUpIcon', chevronUpIcon)

export default ChevronUpIcon
