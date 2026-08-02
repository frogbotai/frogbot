import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const linkSquareIcon: IconNode = [
  [
    'path',
    {
      d: 'M11.1003 3.0022C7.45138 3.00876 5.54061 3.09834 4.3195 4.31943C3.00171 5.63718 3.00171 7.75808 3.00171 11.9998C3.00171 16.2416 3.00171 18.3625 4.3195 19.6802C5.63728 20.998 7.75824 20.998 12.0002 20.998C16.242 20.998 18.363 20.998 19.6808 19.6802C20.9019 18.4592 20.9915 16.5485 20.9981 12.8997',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M20.4802 3.51739L14.9309 9.05138M20.4802 3.51739C19.9862 3.02288 16.6586 3.06898 15.9551 3.07898M20.4802 3.51739C20.9741 4.0119 20.9281 7.34317 20.9181 8.04742',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
]

const LinkSquareIcon = createLucideIcon('LinkSquare', linkSquareIcon)

export default LinkSquareIcon