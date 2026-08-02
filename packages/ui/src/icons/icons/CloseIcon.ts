import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const closeIcon: IconNode = [
  [
    'path',
    {
      d: 'M18 6L6.00081 17.9992M17.9992 18L6 6.00085',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
]

const CloseIcon = createLucideIcon('Close', closeIcon)

export default CloseIcon