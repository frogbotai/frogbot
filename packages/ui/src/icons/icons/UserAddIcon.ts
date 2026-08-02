import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const userAddIcon: IconNode = [
  [
    'path',
    {
      d: 'M20.0013 10.6667C20.0013 6.98477 17.0165 4 13.3346 4C9.65274 4 6.66797 6.98477 6.66797 10.6667C6.66797 14.3485 9.65274 17.3333 13.3346 17.3333C17.0165 17.3333 20.0013 14.3485 20.0013 10.6667Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M23.3346 28V18.6666M18.668 23.3333H28.0013',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M4 26.6667C4 21.512 8.17868 17.3334 13.3333 17.3334C15.3163 17.3334 17.1549 17.9518 18.6667 19.0063',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
]

const UserAddIcon = createLucideIcon('UserAddIcon', userAddIcon, undefined, '0 0 32 32')

export default UserAddIcon
