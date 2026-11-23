import type { HTMLAttributes, ReactNode } from 'react';

export type FactListProps = HTMLAttributes<HTMLDListElement> & {
  /** `rows` puts the label beside the value, like a record's details panel. `stacked` puts it above. Default `rows`. */
  layout?: 'rows' | 'stacked';
};

export type FactProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  children?: ReactNode;
  /** What the value is. */
  label: ReactNode;
};

/** Label and value pairs for data people read but don't edit. */
export function FactList({ className, layout = 'rows', ...props }: FactListProps) {
  return (
    <dl
      className={`fb-fact-list fb-fact-list--${layout}${className ? ` ${className}` : ''}`}
      {...props}
    />
  );
}

/** One label and its value, inside a `FactList`. An empty value shows a dash. */
export function Fact({ children, className, label, ...props }: FactProps) {
  const empty = children === undefined || children === null || children === '';

  return (
    <div className={`fb-fact${className ? ` ${className}` : ''}`} {...props}>
      <dt className="fb-fact__label">{label}</dt>
      <dd className={`fb-fact__value${empty ? ' fb-fact__value--empty' : ''}`}>
        {empty ? '—' : children}
      </dd>
    </div>
  );
}
