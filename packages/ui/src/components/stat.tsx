import type { HTMLAttributes, ReactNode } from 'react';

import ArrowDownIcon from '../icons/icons/ArrowDownIcon.js';
import ArrowUpIcon from '../icons/icons/ArrowUpIcon.js';
import { Sparkline } from './chart.js';

export type StatProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** Change since the last period, as a fraction: `0.12` reads `+12%`. */
  change?: number;
  /** Words after the change, such as `vs last week`. */
  changeLabel?: string;
  /** Set when a fall is good news, such as costs or churn. */
  invert?: boolean;
  /** What the number is, in a few words. */
  label: ReactNode;
  /** `lg` for the one number a screen is about. Default `md`. */
  size?: 'lg' | 'md' | 'sm';
  /** Recent values, oldest first, drawn as a sparkline. */
  trend?: number[];
  /** The number, already formatted, or a `Value`. */
  value: ReactNode;
};

/** One headline number with its label, and optionally its change and recent trend. */
export function Stat({
  change,
  changeLabel,
  className,
  invert,
  label,
  size = 'md',
  trend,
  value,
  ...props
}: StatProps) {
  const good = change === undefined || change === 0 ? undefined : change > 0 !== Boolean(invert);
  const Arrow = change !== undefined && change < 0 ? ArrowDownIcon : ArrowUpIcon;

  return (
    <div className={`fb-stat fb-stat--${size}${className ? ` ${className}` : ''}`} {...props}>
      <div className="fb-stat__label">{label}</div>
      <div className="fb-stat__row">
        <div className="fb-stat__value">{value}</div>
        {trend && trend.length > 1 && <Sparkline className="fb-stat__trend" data={trend} />}
      </div>
      {change !== undefined && (
        <div className="fb-stat__change">
          <span
            className={`fb-stat__delta${good === undefined ? '' : good ? ' fb-stat__delta--good' : ' fb-stat__delta--bad'}`}
          >
            {change !== 0 && <Arrow aria-hidden size={12} />}
            {new Intl.NumberFormat(undefined, {
              style: 'percent',
              maximumFractionDigits: 1,
              signDisplay: 'exceptZero',
            }).format(change)}
          </span>
          {changeLabel && <span className="fb-stat__change-label">{changeLabel}</span>}
        </div>
      )}
    </div>
  );
}

export type StatGridProps = HTMLAttributes<HTMLDivElement> & {
  /** Columns on a wide screen; the grid wraps to fewer on narrow ones. Default 4. */
  columns?: 2 | 3 | 4;
  /** Draw the grid as one bordered panel with dividers. */
  bordered?: boolean;
};

/** Lays out `Stat`s in an even, wrapping grid. */
export function StatGrid({ bordered, className, columns = 4, ...props }: StatGridProps) {
  return (
    <div
      className={`fb-stat-grid fb-stat-grid--${columns}${bordered ? ' fb-stat-grid--bordered' : ''}${className ? ` ${className}` : ''}`}
      {...props}
    />
  );
}
