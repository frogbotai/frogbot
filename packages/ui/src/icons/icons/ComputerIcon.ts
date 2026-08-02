import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const computerIcon: IconNode = [
  [
    'path',
    {
      d: 'M18 8V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M10 19v-3.96 3.15',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M7 19h5',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'rect',
    {
      width: '6',
      height: '10',
      x: '16',
      y: '12',
      rx: '2',
    },
  ],
]

const ComputerIcon = createLucideIcon('ComputerIcon', computerIcon)

export default ComputerIcon
