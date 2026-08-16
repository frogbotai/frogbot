import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const microsoftIcon: IconNode = [
  [
    'path',
    {
      d: 'M1 1h10v10H1z',
      fill: 'currentColor',
    },
  ],
  [
    'path',
    {
      d: 'M12 1h10v10H12z',
      fill: 'currentColor',
    },
  ],
  [
    'path',
    {
      d: 'M1 12h10v10H1z',
      fill: 'currentColor',
    },
  ],
  [
    'path',
    {
      d: 'M12 12h10v10H12z',
      fill: 'currentColor',
    },
  ],
]

const MicrosoftIcon = createLucideIcon('MicrosoftIcon', microsoftIcon, 0, '0 0 23 23')

export default MicrosoftIcon
