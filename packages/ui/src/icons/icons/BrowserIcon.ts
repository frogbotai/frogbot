import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const browserIcon: IconNode = [
  [
    'path',
    {
      d: 'M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z',
    },
  ],
  [
    'path',
    {
      d: 'M2.5 9H21.5',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M7 6H7.00898',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M11 6H11.009',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
]

const BrowserIcon = createLucideIcon('BrowserIcon', browserIcon, 1.5)

export default BrowserIcon
