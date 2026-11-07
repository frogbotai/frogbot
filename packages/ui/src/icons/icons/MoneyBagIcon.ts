import createLucideIcon from '../createLucideIcon.js';
import type { IconNode } from '../types.js';

export const moneyBagIcon: IconNode = [
  [
    'path',
    {
      d: 'M9.9992 18.3342C15.7754 18.3342 17.993 16.6256 17.4095 12.5008 16.9969 9.5842 14.0088 6.6675 12.0834 5.8342H7.9168C5.9914 6.6675 3.003 9.5842 2.5904 12.5008 2.0069 16.6256 4.2245 18.3342 10.0007 18.3342',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M11.6668 5.8325C12.5001 5.4158 13.3334 4.1675 13.3334 2.9175 13.3334 2.2262 12.7731 1.6659 12.0818 1.6659H7.9184C7.2271 1.6659 6.6668 2.2262 6.6668 2.9175 6.6668 4.1675 7.5001 5.4158 8.3334 5.8325',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M10.0001 14.5842H10.4168C11.1071 14.5842 11.6668 14.0245 11.6668 13.3342 11.6668 12.6438 11.1071 12.0842 10.4168 12.0842H9.5834C8.8931 12.0842 8.3334 11.5245 8.3334 10.8342 8.3334 10.1438 8.8931 9.5842 9.5834 9.5842H10.0001M10.0001 14.5842H8.3334M10.0001 14.5842V15.4175M11.6668 9.5842H10.0001M10.0001 9.5842V8.7508',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

const MoneyBagIcon = createLucideIcon('MoneyBagIcon', moneyBagIcon, undefined, '0 0 20 20');

export default MoneyBagIcon;
