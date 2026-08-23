import type { HTMLAttributes } from 'react';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`fb-skeleton${className ? ` ${className}` : ''}`} {...props} />;
}
