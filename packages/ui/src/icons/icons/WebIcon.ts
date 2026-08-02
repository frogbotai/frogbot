import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const webIcon: IconNode = [
  [
    'path',
    {
      d: 'M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z',
    },
  ],
  [
    'path',
    {
      d: 'M8 12C8 18 12 22 12 22C12 22 16 18 16 12C16 6 12 2 12 2C12 2 8 6 8 12Z',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M21 15H3',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M21 9H3',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
]

const WebIcon = createLucideIcon('Web', webIcon, 1.25)

export default WebIcon
