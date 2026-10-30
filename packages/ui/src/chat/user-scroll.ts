const scrollKeys = new Set(['ArrowDown', 'ArrowUp', 'End', 'Home', 'PageDown', 'PageUp', ' ']);

const inputs = ['wheel', 'touchmove', 'pointerdown', 'keydown'] as const;

/**
 * Calls `onInput` when the user starts scrolling `scroller`: a wheel, a touch drag, a press on
 * its scrollbar or a scroll key. Scrolls made by code never call it. Returns the cleanup.
 */
export function onUserScroll(scroller: HTMLElement, onInput: () => void) {
  const handle = (event: Event) => {
    if (event.type === 'pointerdown' && event.target !== scroller) return;

    if (event instanceof KeyboardEvent && !scrollKeys.has(event.key)) return;

    onInput();
  };

  inputs.forEach((type) => scroller.addEventListener(type, handle, { passive: true }));

  return () => inputs.forEach((type) => scroller.removeEventListener(type, handle));
}

export function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
