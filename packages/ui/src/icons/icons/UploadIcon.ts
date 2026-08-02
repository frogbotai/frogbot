import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const uploadIcon: IconNode = [
  [
    'path',
    {
      d: 'M1.99994 11.3333C1.99994 11.9533 1.99994 12.2633 2.06809 12.5176C2.25302 13.2077 2.79212 13.7469 3.4823 13.9318C3.73663 13.9999 4.04663 13.9999 4.66661 13.9999H11.3332C11.9532 13.9999 12.2632 13.9999 12.5176 13.9318C13.2078 13.7469 13.7468 13.2077 13.9318 12.5176C13.9999 12.2633 13.9999 11.9533 13.9999 11.3333',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M11 4.99986C11 4.99986 8.79058 1.99988 8.00005 1.99988C7.20945 1.99987 5.00006 4.99988 5.00006 4.99988M8.00005 2.66654V10.6666',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
]

const UploadIcon = createLucideIcon('UploadIcon', uploadIcon, 1.5, '0 0 16 16')

export default UploadIcon
