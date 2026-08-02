import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const resizeIcon: IconNode = [
  [
    'path',
    {
      d: 'M10 20V4',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M14 20V4',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M10 12H4',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M20 12H14',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M18 9C18.6068 9.58984 21 11.1597 21 12C21 12.8403 18.6068 14.4102 18 15',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M6 9C5.3932 9.58984 3 11.1597 3 12C3 12.8403 5.3932 14.4102 6 15',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
]

const ResizeIcon = createLucideIcon('Resize', resizeIcon)

export default ResizeIcon
