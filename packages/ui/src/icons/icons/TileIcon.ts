import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const tileIcon: IconNode = [
  [
    'path',
    {
      d: 'M7.5 2.5H3.33333C2.8731 2.5 2.5 2.8731 2.5 3.33333V7.5C2.5 7.96024 2.8731 8.33333 3.33333 8.33333H7.5C7.96024 8.33333 8.33333 7.96024 8.33333 7.5V3.33333C8.33333 2.8731 7.96024 2.5 7.5 2.5Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M16.6667 2.5H12.5C12.0398 2.5 11.6667 2.8731 11.6667 3.33333V7.5C11.6667 7.96024 12.0398 8.33333 12.5 8.33333H16.6667C17.1269 8.33333 17.5 7.96024 17.5 7.5V3.33333C17.5 2.8731 17.1269 2.5 16.6667 2.5Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M16.6667 11.6665H12.5C12.0398 11.6665 11.6667 12.0396 11.6667 12.4998V16.6665C11.6667 17.1267 12.0398 17.4998 12.5 17.4998H16.6667C17.1269 17.4998 17.5 17.1267 17.5 16.6665V12.4998C17.5 12.0396 17.1269 11.6665 16.6667 11.6665Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M7.5 11.6665H3.33333C2.8731 11.6665 2.5 12.0396 2.5 12.4998V16.6665C2.5 17.1267 2.8731 17.4998 3.33333 17.4998H7.5C7.96024 17.4998 8.33333 17.1267 8.33333 16.6665V12.4998C8.33333 12.0396 7.96024 11.6665 7.5 11.6665Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
]

const TileIcon = createLucideIcon('TileIcon', tileIcon, 1.67, '0 0 20 20')

export default TileIcon
