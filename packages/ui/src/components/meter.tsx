import type { HTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';

import type { StatusTone } from './status-badge.js';

export type MeterProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** What is measured, shown above the bar. */
  label?: ReactNode;
  /** Upper bound. Default 100. */
  max?: number;
  /** Show the value beside the label. Default true when there's a label. */
  showValue?: boolean;
  /** Colour by meaning. Default `success` for the bar's top third, `warning` for the middle, `danger` below; set `neutral` for plain progress. */
  tone?: StatusTone | 'auto';
  /** The current value, from 0 to `max`. */
  value: number;
};

function autoTone(ratio: number): StatusTone {
  if (ratio >= 2 / 3) return 'success';

  return ratio >= 1 / 3 ? 'warning' : 'danger';
}

/** A score or progress from 0 to a maximum, as a thin bar. */
export function Meter({
  className,
  label,
  max = 100,
  showValue,
  tone = 'auto',
  value,
  ...props
}: MeterProps) {
  const labelId = useId();
  const clamped = Number.isFinite(value) ? Math.min(Math.max(value, 0), max) : 0;
  const ratio = max ? clamped / max : 0;
  const color = tone === 'auto' ? autoTone(ratio) : tone;
  const valueShown = showValue ?? Boolean(label);

  return (
    <div className={`fb-meter fb-meter--${color}${className ? ` ${className}` : ''}`} {...props}>
      {(label || valueShown) && (
        <div className="fb-meter__header">
          {label && (
            <span className="fb-meter__label" id={labelId}>
              {label}
            </span>
          )}
          {valueShown && (
            <span className="fb-meter__value">
              {Math.round(clamped)}
              {max === 100 ? '' : ` / ${max}`}
            </span>
          )}
        </div>
      )}
      <div
        aria-labelledby={label ? labelId : undefined}
        aria-valuemax={max}
        aria-valuemin={0}
        aria-valuenow={clamped}
        className="fb-meter__track"
        role="meter"
      >
        <div className="fb-meter__fill" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}
