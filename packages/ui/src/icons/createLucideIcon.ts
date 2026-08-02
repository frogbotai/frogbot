import { createElement, forwardRef } from 'react'
import { IconNode, LucideProps } from './types'
import IconBase from './IconBase'

// Helper functions
const toKebabCase = (str: string): string => {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

const toPascalCase = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

const mergeClasses = (...classes: (string | undefined)[]): string => {
  return classes.filter(Boolean).join(' ')
}

const createLucideIcon = (
  iconName: string,
  iconNode: IconNode,
  defaultStrokeWidth?: number,
  defaultViewBox?: string,
) => {
  const Component = forwardRef<SVGSVGElement, LucideProps>(({ className, ...props }, ref) =>
    createElement(IconBase, {
      ref,
      iconNode,
      className: mergeClasses(`lucide-${toKebabCase(iconName)}`, className),
      ...(defaultStrokeWidth !== undefined && { strokeWidth: defaultStrokeWidth }),
      ...(defaultViewBox !== undefined && { viewBox: defaultViewBox }),
      ...props,
    }),
  )

  Component.displayName = toPascalCase(iconName)

  return Component
}

export default createLucideIcon
