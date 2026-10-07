import { createElement, forwardRef } from 'react';

import defaultAttributes from './defaultAttributes.js';
import type { IconNode, LucideProps } from './types.js';

const mergeClasses = (...classes: (string | undefined)[]): string => {
  return classes.filter(Boolean).join(' ');
};

const hasA11yProp = (props: object): boolean => {
  return Object.keys(props).some((key) => key.startsWith('aria-') || key === 'role');
};

const gridSize = (viewBox: string) => {
  const [, , width, height] = viewBox.trim().split(/[\s,]+/);

  return Math.max(Number(width), Number(height));
};

interface IconComponentProps extends LucideProps {
  iconNode: IconNode;
}

const IconBase = forwardRef<SVGSVGElement, IconComponentProps>(
  (
    {
      color = 'currentColor',
      size = 24,
      strokeWidth,
      absoluteStrokeWidth,
      viewBox = defaultAttributes.viewBox,
      className = '',
      children,
      iconNode,
      ...rest
    },
    ref,
  ) => {
    const grid = gridSize(viewBox);

    const stroke = absoluteStrokeWidth
      ? (Number(strokeWidth ?? 2) * grid) / Number(size)
      : (strokeWidth ?? (2 * grid) / 20);

    return createElement(
      'svg',
      {
        ref,
        ...defaultAttributes,
        viewBox,
        width: size,
        height: size,
        stroke: color,
        strokeWidth: stroke,
        className: mergeClasses('lucide', className),
        ...(!children && !hasA11yProp(rest) && { 'aria-hidden': 'true' }),
        ...rest,
      },
      [
        ...iconNode.map(([tag, attrs], index) => createElement(tag, { ...attrs, key: index })),
        ...(Array.isArray(children) ? children : [children]),
      ],
    );
  },
);

IconBase.displayName = 'IconBase';

export default IconBase;
