'use client';

import './index.css';

import type { ReactNode } from 'react';

export type KindLinkProps = {
  children: ReactNode;
  className?: string;
  external?: boolean;
  href: string;
  title?: string;
};

export function KindLink({ children, className, external, href, title }: KindLinkProps) {
  return (
    <a
      className={className ? `kind-link ${className}` : 'kind-link'}
      href={href}
      onClick={(event) => event.stopPropagation()}
      title={title}
      {...(external && { rel: 'noopener noreferrer', target: '_blank' })}
    >
      {children}
    </a>
  );
}
