import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const profileIcon: IconNode = [
  [
    'path',
    {
      d: 'M14.1668 7.08329C14.1668 4.78211 12.3013 2.91663 10.0002 2.91663C7.69898 2.91663 5.8335 4.78211 5.8335 7.08329C5.8335 9.38446 7.69898 11.25 10.0002 11.25C12.3013 11.25 14.1668 9.38446 14.1668 7.08329Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M15.8332 17.0833C15.8332 13.8617 13.2215 11.25 9.99984 11.25C6.77818 11.25 4.1665 13.8617 4.1665 17.0833',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
]

const ProfileIcon = createLucideIcon('ProfileIcon', profileIcon, 1.5, '0 0 20 20')

export default ProfileIcon
