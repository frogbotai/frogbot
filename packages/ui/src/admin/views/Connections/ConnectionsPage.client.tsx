'use client';

import '../CollectionViewShell.css';

import { useStepNav } from '@payloadcms/ui';
import { type ReactNode, useEffect } from 'react';

export function ConnectionsPage({ children, title }: { children: ReactNode; title: string }) {
  const { setStepNav } = useStepNav();

  useEffect(() => {
    setStepNav([{ label: title }]);
  }, [setStepNav, title]);

  return (
    <main className="collection-list collection-view collection-view--custom frogbot-connections-page">
      <header className="list-header">
        <div className="list-header__content">
          <div className="list-header__title-and-actions">
            <h1 className="list-header__title">{title}</h1>
          </div>
        </div>
      </header>
      <div className="collection-view__view">{children}</div>
    </main>
  );
}
