import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const checkmarkIcon: IconNode = [
  [
    'path',
    {
      d: 'M11.098 0.390037L3.93797 7.30004L2.03797 5.27004C1.68797 4.94004 1.13797 4.92004 0.737968 5.20004C0.347968 5.49004 0.237968 6.00004 0.477968 6.41004L2.72797 10.07C2.94797 10.41 3.32797 10.62 3.75797 10.62C4.16797 10.62 4.55797 10.41 4.77797 10.07C5.13797 9.60004 12.008 1.41004 12.008 1.41004C12.908 0.490037 11.818 -0.319963 11.098 0.380037V0.390037Z',
      fillRule: 'evenodd',
      clipRule: 'evenodd',
      fill: 'currentColor',
    },
  ],
]

const CheckmarkIcon = createLucideIcon('CheckmarkIcon', checkmarkIcon, 0, '0 0 13 11')

export default CheckmarkIcon
