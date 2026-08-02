import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const infoCircleIcon: IconNode = [
  [
    'path',
    {
      d: 'M18.3307 9.99935C18.3307 5.39697 14.5997 1.66602 9.9974 1.66602C5.39502 1.66602 1.66406 5.39697 1.66406 9.99935C1.66406 14.6017 5.39502 18.3327 9.9974 18.3327C14.5997 18.3327 18.3307 14.6017 18.3307 9.99935Z',
      opacity: '0.64',
    },
  ],
  [
    'path',
    {
      d: 'M10.2005 14.166V9.99935C10.2005 9.60652 10.2005 9.4101 10.0784 9.28802C9.95644 9.16602 9.76002 9.16602 9.36719 9.16602',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      opacity: '0.64',
    },
  ],
  [
    'path',
    {
      d: 'M9.99219 6.66602H9.99969',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      opacity: '0.64',
    },
  ],
]

const InfoCircleIcon = createLucideIcon('InfoCircleIcon', infoCircleIcon, 1.25, '0 0 20 20')

export default InfoCircleIcon
