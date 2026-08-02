import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const chevronDownIcon: IconNode = [
  [
    'path',
    {
      d: 'M18 9.00005C18 9.00005 13.5811 15 12 15C10.4188 15 6 9 6 9',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
]

const ChevronDownIcon = createLucideIcon('ChevronDownIcon', chevronDownIcon)

export default ChevronDownIcon
