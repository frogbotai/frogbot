import { createElement, forwardRef } from 'react'
import defaultAttributes from './defaultAttributes'
import { IconNode, LucideProps } from './types'

// Helper functions (simplified versions)
const mergeClasses = (...classes: (string | undefined)[]): string => {
  return classes.filter(Boolean).join(' ')
}

const hasA11yProp = (props: Record<string, any>): boolean => {
  return Object.keys(props).some((key) => key.startsWith('aria-') || key === 'role')
}

interface IconComponentProps extends LucideProps {
  iconNode: IconNode
}

const IconBase = forwardRef<SVGSVGElement, IconComponentProps>(
  (
    {
      color = 'currentColor',
      size = 24,
      strokeWidth = 2,
      absoluteStrokeWidth,
      className = '',
      children,
      iconNode,
      ...rest
    },
    ref,
  ) =>
    createElement(
      'svg',
      {
        ref,
        ...defaultAttributes,
        width: size,
        height: size,
        stroke: color,
        strokeWidth: absoluteStrokeWidth ? (Number(strokeWidth) * 24) / Number(size) : strokeWidth,
        className: mergeClasses('lucide', className),
        ...(!children && !hasA11yProp(rest) && { 'aria-hidden': 'true' }),
        ...rest,
      },
      [
        // Map iconNode array to actual SVG elements
        ...iconNode.map(([tag, attrs], index) => createElement(tag, { ...attrs, key: index })),
        // Include any children passed to the component
        ...(Array.isArray(children) ? children : [children]),
      ],
    ),
)

IconBase.displayName = 'IconBase'

export default IconBase
