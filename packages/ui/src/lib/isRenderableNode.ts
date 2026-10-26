import { isValidElement, type ReactNode } from 'react';

const lazySymbol = Symbol.for('react.lazy');

/**
 * An element, or the lazy wrapper React's Flight client hands a client component in place of a
 * server-created element. `isValidElement` alone is false for the wrapper.
 */
export function isRenderableNode(value: unknown): value is ReactNode {
  return (
    isValidElement(value) ||
    (typeof value === 'object' &&
      value !== null &&
      (value as { $$typeof?: unknown }).$$typeof === lazySymbol)
  );
}
