import type { HTMLAttributes } from 'react';

export type StatusTone = 'danger' | 'info' | 'neutral' | 'success' | 'warning';

export type StatusBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  /** Show a dot before the text. Default true. */
  dot?: boolean;
  /** What the status means: done is `success`, waiting on someone is `warning`, failed is `danger`. Default `neutral`. */
  tone?: StatusTone;
};

/** A record's status as a small pill, one colour per meaning. */
export function StatusBadge({
  className,
  children,
  dot = true,
  tone = 'neutral',
  ...props
}: StatusBadgeProps) {
  return (
    <span
      className={`fb-status-badge fb-status-badge--${tone}${className ? ` ${className}` : ''}`}
      {...props}
    >
      {dot && <span aria-hidden className="fb-status-badge__dot" />}
      {children}
    </span>
  );
}
