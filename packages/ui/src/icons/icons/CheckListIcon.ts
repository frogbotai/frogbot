import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const checkListIcon: IconNode = [
  [
    'path',
    {
      d: 'M11 6H21',
      strokeLinecap: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M11 12H21',
      strokeLinecap: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M11 18H21',
      strokeLinecap: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M3 7.39286C3 7.39286 4 8.04466 4.5 9C4.5 9 6 5.25 8 4',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M3 18.3929C3 18.3929 4 19.0447 4.5 20C4.5 20 6 16.25 8 15',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
]

const CheckListIcon = createLucideIcon('CheckListIcon', checkListIcon, 1.5)

export default CheckListIcon
