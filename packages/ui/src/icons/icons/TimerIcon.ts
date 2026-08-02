import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const timerIcon: IconNode = [
  [
    'path',
    {
      d: 'M9.99992 18.3333C14.6023 18.3333 18.3333 14.6023 18.3333 9.99996C18.3333 5.39758 14.6023 1.66663 9.99992 1.66663C6.26852 1.66663 3.14514 4.11903 2.08325 7.49996H4.16659',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M10 6.66663V9.99996L11.6667 11.6666',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M1.66675 10C1.66675 10.2811 1.67941 10.5591 1.7042 10.8333M7.50008 18.3333C7.21541 18.2397 6.93734 18.1303 6.66675 18.0065M2.67457 14.1667C2.51387 13.857 2.37052 13.5361 2.24589 13.2052M4.0261 16.0887C4.28083 16.3632 4.55263 16.6201 4.83971 16.8577',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
]

const TimerIcon = createLucideIcon('TimerIcon', timerIcon, undefined, '0 0 20 20')

export default TimerIcon
