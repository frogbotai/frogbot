import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const bubbleChatIcon: IconNode = [
  [
    'path',
    {
      d: 'M10.0037 10.75H10.0112M13.3333 10.75H13.3408M6.67413 10.75H6.68161',
      strokeWidth: '2',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M17.9166 10.75C17.9166 15.1223 14.3722 18.6667 9.99998 18.6667C8.64323 18.6667 7.36615 18.3254 6.24998 17.724C4.69312 16.885 3.6455 17.665 2.72158 17.8049C2.58143 17.8261 2.44185 17.7752 2.34162 17.675C2.18949 17.5229 2.16053 17.2876 2.24456 17.0895C2.60719 16.2349 2.94015 14.6152 2.48615 13.25C2.22481 12.4642 2.08331 11.6236 2.08331 10.75C2.08331 6.37778 5.62772 2.83337 9.99998 2.83337C14.3722 2.83337 17.9166 6.37778 17.9166 10.75Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'circle',
    {
      cx: '16',
      cy: '4.75',
      r: '4',
      fill: '#3DA55F',
      stroke: '#1E2939',
      strokeWidth: '1.5',
    },
  ],
]

const BubbleChatIcon = createLucideIcon('BubbleChatIcon', bubbleChatIcon, 1.5, '0 0 21 21')

export default BubbleChatIcon
