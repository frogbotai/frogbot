import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const bellIcon: IconNode = [
  [
    'path',
    {
      d: 'M10.3332 12C10.3332 13.2887 9.2885 14.3333 7.99984 14.3333C6.71117 14.3333 5.6665 13.2887 5.6665 12',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M12.8207 12H3.17925C2.52797 12 2 11.472 2 10.8207C2 10.508 2.12424 10.208 2.34539 9.98683L2.74755 9.58469C3.12262 9.20963 3.33333 8.70089 3.33333 8.17049V6.33329C3.33333 3.75597 5.42267 1.66663 8 1.66663C10.5773 1.66663 12.6667 3.75596 12.6667 6.33329V8.17049C12.6667 8.70089 12.8774 9.20963 13.2525 9.58469L13.6546 9.98683C13.8757 10.208 14 10.508 14 10.8207C14 11.472 13.472 12 12.8207 12Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
]

const BellIcon = createLucideIcon('BellIcon', bellIcon)

export default BellIcon
