import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const aiUserIcon: IconNode = [
  [
    'path',
    {
      d: 'M11.6667 7.16667C11.6667 4.86548 9.80121 3 7.50004 3C5.19886 3 3.33337 4.86548 3.33337 7.16667C3.33337 9.46783 5.19886 11.3333 7.50004 11.3333C9.80121 11.3333 11.6667 9.46783 11.6667 7.16667Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M13.3333 17.0833C13.3333 13.8617 10.7216 11.25 7.49996 11.25C4.2783 11.25 1.66663 13.8617 1.66663 17.0833',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M16.0197 3.0179C16.0246 2.99403 16.0587 2.99403 16.0636 3.0179C16.3168 4.25673 17.2849 5.22487 18.5237 5.47807C18.5476 5.48295 18.5476 5.51705 18.5237 5.52193C17.2849 5.77513 16.3168 6.74327 16.0636 7.9821C16.0587 8.00597 16.0246 8.00597 16.0197 7.9821C15.7665 6.74327 14.7984 5.77513 13.5596 5.52193C13.5356 5.51705 13.5356 5.48295 13.5596 5.47807C14.7984 5.22487 15.7665 4.25673 16.0197 3.0179Z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
]

const AiUserIcon = createLucideIcon('AiUserIcon', aiUserIcon, 2, '0 0 20 20')

export default AiUserIcon
