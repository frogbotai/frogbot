import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const questionMarkCircleIcon: IconNode = [
  [
    'path',
    {
      d: 'M9.99984 18.3333C14.6022 18.3333 18.3332 14.6023 18.3332 9.99996C18.3332 5.39759 14.6022 1.66663 9.99984 1.66663C5.39746 1.66663 1.6665 5.39759 1.6665 9.99996C1.6665 14.6023 5.39746 18.3333 9.99984 18.3333Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M7.9165 7.91671C7.9165 6.76612 8.84925 5.83337 9.99984 5.83337C11.1504 5.83337 12.0832 6.76612 12.0832 7.91671C12.0832 8.63079 11.7239 9.26096 11.1763 9.63637C10.6068 10.0266 9.99984 10.5597 9.99984 11.25',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M10 14.1666H10.0074',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
]

const QuestionMarkCircleIcon = createLucideIcon('QuestionMarkCircleIcon', questionMarkCircleIcon)

export default QuestionMarkCircleIcon
