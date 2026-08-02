import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const xIcon: IconNode = [
  [
    'path',
    {
      fillRule: 'evenodd',
      clipRule: 'evenodd',
      d: 'M3.46967 3.46967L4 4L8 8L12 4L12.5303 3.46967L13.5303 4.46967L13 5L9 9L13 13L13.5303 13.5303L12.5303 14.5303L12 14L8 10L4 14L3.46967 14.5303L2.46967 13.5303L3 13L7 9L3 5L2.46967 4.46967L3.46967 3.46967Z',
    },
  ],
]

const XIcon = createLucideIcon('XIcon', xIcon, undefined, '0 0 16 16')

export default XIcon
