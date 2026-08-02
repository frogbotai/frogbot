import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const logoutRightIcon: IconNode = [
  [
    'path',
    {
      d: 'M5.83333 2.5C5.05836 2.5 4.67087 2.5 4.35295 2.58518C3.49022 2.81635 2.81636 3.49022 2.58518 4.35295C2.5 4.67087 2.5 5.05836 2.5 5.83333V14.1667C2.5 14.9417 2.5 15.3292 2.58518 15.6471C2.81635 16.5098 3.49022 17.1837 4.35295 17.4148C4.67087 17.5 5.05836 17.5 5.83333 17.5',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M13.7499 13.75C13.7499 13.75 17.4998 10.9882 17.4998 10C17.4998 9.01175 13.7498 6.25 13.7498 6.25M16.6665 10H6.6665',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
]

const LogoutRightIcon = createLucideIcon('LogoutRightIcon', logoutRightIcon, 1.5, '0 0 20 20')

export default LogoutRightIcon
