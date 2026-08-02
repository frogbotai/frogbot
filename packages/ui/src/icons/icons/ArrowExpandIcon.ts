import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const arrowExpandIcon: IconNode = [
  [
    'path',
    {
      d: 'M16.5 3.26621C17.3444 3.25421 20.1409 2.67328 20.7338 3.26621C21.3267 3.85913 20.7458 6.65559 20.7338 7.5M20.506 3.49097L13.5022 10.4961',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M3.26646 16.5001C3.25446 17.3445 2.67353 20.141 3.26646 20.7339C3.85938 21.3268 6.65584 20.7459 7.50025 20.7339M10.5021 13.4976L3.49834 20.5027',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
]

const ArrowExpandIcon = createLucideIcon('ArrowExpand', arrowExpandIcon)

export default ArrowExpandIcon