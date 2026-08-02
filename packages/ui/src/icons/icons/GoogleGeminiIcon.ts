import { createElement, forwardRef } from 'react'
import { LucideProps } from '../types'

const GoogleGeminiIcon = forwardRef<SVGSVGElement, LucideProps>(
  ({ size = 20, className = '', ...props }, ref) =>
    createElement(
      'svg',
      {
        ref,
        width: size,
        height: size,
        viewBox: '0 0 20 20',
        fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg',
        className: `lucide-google-gemini-icon ${className}`,
        ...props,
      },
      [
        createElement(
          'g',
          {
            key: 'clip-g',
            clipPath: 'url(#clip0_5536_2187)',
          },
          [
            createElement('path', {
              key: 'star-path',
              d: 'M20 10.02C17.4052 10.1792 14.9583 11.2818 13.12 13.12C11.2818 14.9583 10.1792 17.4052 10.02 20H9.98C9.82103 17.4051 8.71853 14.958 6.88025 13.1197C5.04198 11.2815 2.59485 10.179 0 10.02L0 9.98C2.59485 9.82103 5.04198 8.71853 6.88025 6.88025C8.71853 5.04198 9.82103 2.59485 9.98 0L10.02 0C10.1792 2.59476 11.2818 5.04173 13.12 6.87996C14.9583 8.71818 17.4052 9.82076 20 9.98V10.02Z',
              fill: 'url(#paint0_radial_5536_2187)',
            }),
          ],
        ),
        createElement('defs', { key: 'defs' }, [
          createElement(
            'radialGradient',
            {
              key: 'gradient',
              id: 'paint0_radial_5536_2187',
              cx: '0',
              cy: '0',
              r: '1',
              gradientUnits: 'userSpaceOnUse',
              gradientTransform: 'translate(1.985 8.12875) rotate(18.6832) scale(21.2875 170.526)',
            },
            [
              createElement('stop', {
                key: 'stop1',
                offset: '0.067',
                stopColor: '#9168C0',
              }),
              createElement('stop', {
                key: 'stop2',
                offset: '0.343',
                stopColor: '#5684D1',
              }),
              createElement('stop', {
                key: 'stop3',
                offset: '0.672',
                stopColor: '#1BA1E3',
              }),
            ],
          ),
          createElement(
            'clipPath',
            {
              key: 'clippath',
              id: 'clip0_5536_2187',
            },
            [
              createElement('rect', {
                key: 'cliprect',
                width: '20',
                height: '20',
                fill: 'white',
              }),
            ],
          ),
        ]),
      ],
    ),
)

GoogleGeminiIcon.displayName = 'GoogleGeminiIcon'

export default GoogleGeminiIcon
