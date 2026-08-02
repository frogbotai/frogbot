import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const listIcon: IconNode = [
  [
    'path',
    {
      d: 'M2.5 4.1665H2.50833',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M2.5 10H2.50833',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M2.5 15.8335H2.50833',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M6.66669 4.1665H17.5',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M6.66669 10H17.5',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M6.66669 15.8335H17.5',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
]

const ListIcon = createLucideIcon('ListIcon', listIcon, 1.67, '0 0 20 20')

export default ListIcon
