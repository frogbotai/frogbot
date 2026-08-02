import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const plusSignIcon: IconNode = [
  [
    'path',
    {
      d: 'M12 4V20M20 12H4',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
]

const PlusSignIcon = createLucideIcon('PlusSign', plusSignIcon)

export default PlusSignIcon
