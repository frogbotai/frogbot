import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const sendIcon: IconNode = [
  [
    'path',
    {
      d: 'M14.0316 2.03537C12.5796 0.471656 1.65749 4.30221 1.66651 5.70075C1.67674 7.28668 5.9319 7.77455 7.1113 8.10548C7.82057 8.30441 8.0105 8.50841 8.17404 9.25215C8.9147 12.6204 9.28657 14.2957 10.1341 14.3331C11.485 14.3929 15.4487 3.56141 14.0316 2.03537Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M7.6665 8.33333L9.99984 6',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
]

const SendIcon = createLucideIcon('SendIcon', sendIcon, 1.5, '0 0 16 16')

export default SendIcon
