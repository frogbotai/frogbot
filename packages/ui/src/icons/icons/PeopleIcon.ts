import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const peopleIcon: IconNode = [
  [
    'path',
    {
      d: 'M26 14C26 18.4183 22.4182 22 18 22C13.5817 22 10 18.4183 10 14C10 9.58172 13.5817 6 18 6C22.4182 6 26 9.58172 26 14Z',
    },
  ],
  [
    'path',
    {
      d: 'M30 22C34.4182 22 38 18.4183 38 14C38 9.58172 34.4182 6 30 6',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M22 28L14 28C8.47716 28 4 32.4772 4 38C4 40.2092 5.79086 42 8 42H28C30.2092 42 32 40.2092 32 38C32 32.4772 27.5228 28 22 28Z',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M34 28C39.5228 28 44 32.4772 44 38C44 40.2092 42.2092 42 40 42H37',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
]

const PeopleIcon = createLucideIcon('PeopleIcon', peopleIcon, 4, '0 0 48 48')

export default PeopleIcon
