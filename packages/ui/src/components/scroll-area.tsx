'use client';
import * as Primitive from '@radix-ui/react-scroll-area';
import { type ComponentProps, type Ref, useEffect, useRef, useState } from 'react';

import { composeRefs } from '../lib/utils.js';
export type ScrollAreaProps = ComponentProps<typeof Primitive.Root> & {
  viewPortClassName?: string;
  orientation?: 'vertical' | 'horizontal';
  viewPortRef?: Ref<HTMLDivElement>;
  showGradient?: boolean;
  gradientClassName?: string;
};
export function ScrollArea({
  className,
  children,
  viewPortClassName,
  viewPortRef,
  orientation = 'vertical',
  showGradient = false,
  gradientClassName,
  ...props
}: ScrollAreaProps) {
  const internalRef = useRef<HTMLDivElement>(null);
  const [showBottomGradient, setShowBottomGradient] = useState(false);

  useEffect(() => {
    const viewport = internalRef.current;
    if (!showGradient || !viewport) return;
    const update = () => {
      setShowBottomGradient(
        viewport.scrollHeight > viewport.clientHeight &&
          viewport.scrollTop + viewport.clientHeight < viewport.scrollHeight - 1,
      );
    };
    update();
    viewport.addEventListener('scroll', update);
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update);
    if (viewport.firstElementChild) observer?.observe(viewport.firstElementChild);
    return () => {
      viewport.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [showGradient]);

  return (
    <Primitive.Root className={`fb-scroll-area${className ? ` ${className}` : ''}`} {...props}>
      <Primitive.Viewport
        ref={composeRefs(internalRef, viewPortRef)}
        className={`fb-scroll-area__viewport${viewPortClassName ? ` ${viewPortClassName}` : ''}`}
      >
        {children}
      </Primitive.Viewport>
      <ScrollBar orientation={orientation} />
      <Primitive.Corner />
      {showGradient && showBottomGradient && (
        <div
          className={`fb-scroll-area__gradient${gradientClassName ? ` ${gradientClassName}` : ''}`}
        />
      )}
    </Primitive.Root>
  );
}
export function ScrollBar({
  className,
  orientation = 'vertical',
  ...props
}: ComponentProps<typeof Primitive.Scrollbar>) {
  return (
    <Primitive.Scrollbar
      orientation={orientation}
      className={`fb-scroll-area__scrollbar fb-scroll-area__scrollbar--${orientation}${className ? ` ${className}` : ''}`}
      {...props}
    >
      <Primitive.Thumb className="fb-scroll-area__thumb" />
    </Primitive.Scrollbar>
  );
}
