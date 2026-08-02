import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const moreVerticalIcon: IconNode = [
  [
    'path',
    {
      d: 'M9.99999 10.8332C10.4602 10.8332 10.8333 10.4601 10.8333 9.99984C10.8333 9.5396 10.4602 9.1665 9.99999 9.1665C9.53975 9.1665 9.16666 9.5396 9.16666 9.99984C9.16666 10.4601 9.53975 10.8332 9.99999 10.8332Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M9.99999 5.00016C10.4602 5.00016 10.8333 4.62707 10.8333 4.16683C10.8333 3.70659 10.4602 3.3335 9.99999 3.3335C9.53975 3.3335 9.16666 3.70659 9.16666 4.16683C9.16666 4.62707 9.53975 5.00016 9.99999 5.00016Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M9.99999 16.6667C10.4602 16.6667 10.8333 16.2936 10.8333 15.8333C10.8333 15.3731 10.4602 15 9.99999 15C9.53975 15 9.16666 15.3731 9.16666 15.8333C9.16666 16.2936 9.53975 16.6667 9.99999 16.6667Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
]

const MoreVerticalIcon = createLucideIcon(
  'MoreVerticalIcon',
  moreVerticalIcon,
  1.66667,
  '0 0 20 20',
)

export default MoreVerticalIcon
