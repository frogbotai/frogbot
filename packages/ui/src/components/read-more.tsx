'use client';

import type { HTMLAttributes } from 'react';
import { useLayoutEffect, useRef, useState } from 'react';

export type ReadMoreProps = HTMLAttributes<HTMLDivElement> & {
  /** Lines shown before "Show more". Default 2. */
  lines?: number;
};

/** Long text cut to a few lines, with a toggle that appears only when the text is cut. */
export function ReadMore({ children, className, lines = 2, style, ...props }: ReadMoreProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;

    if (!element || open) return;

    setCut(element.scrollHeight > element.clientHeight + 1);
  }, [children, lines, open]);

  return (
    <div className={`fb-read-more${className ? ` ${className}` : ''}`} {...props}>
      <div
        className={`fb-read-more__text${open ? '' : ' fb-read-more__text--clamped'}`}
        ref={ref}
        style={{ ...style, WebkitLineClamp: open ? undefined : lines }}
      >
        {children}
      </div>
      {(cut || open) && (
        <button className="fb-read-more__toggle" onClick={() => setOpen(!open)} type="button">
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}
