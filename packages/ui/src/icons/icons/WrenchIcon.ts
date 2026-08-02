import { IconNode } from '../types'
import createLucideIcon from '../createLucideIcon'

export const wrenchIcon: IconNode = [
  [
    'path',
    {
      d: 'M3.6416 13.3567C4.8311 14.546 7.0692 14.4998 10.5008 14.4998C12.7086 14.4998 14.4986 12.7071 14.4998 10.4993C14.4998 7.07001 14.546 4.83065 13.3565 3.64138C12.1671 2.45212 11.6417 2.50027 6.3726 2.50027C5.8634 2.49809 5.6071 3.11389 5.9671 3.47394L8.6801 6.18714C9.3687 6.87582 9.3706 7.99233 8.6819 8.68092C7.9932 9.36952 6.8766 9.36959 6.1878 8.68109L3.4741 5.96855C3.114 5.60859 2.4981 5.86483 2.5003 6.37395C2.5003 11.6422 2.4521 12.1675 3.6416 13.3567Z',
    },
  ],
  [
    'path',
    {
      d: 'M10.5 14.5L16.6716 20.6716C17.7761 21.7761 19.567 21.7761 20.6716 20.6716C21.7761 19.567 21.7761 17.7761 20.6716 16.6716L14.5 10.5',
      strokeLinecap: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M18.491 18.5H18.5',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
]

const WrenchIcon = createLucideIcon('WrenchIcon', wrenchIcon)

export default WrenchIcon
