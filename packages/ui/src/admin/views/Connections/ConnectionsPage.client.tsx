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
    <div className="collection-view-shell frogbot-connections-page">
      <div className="collection-view-shell__content">
        <header className="list-header">
          <div className="list-header__content">
            <div className="list-header__title-and-actions">
              <h1 className="list-header__title">{title}</h1>
            </div>
          </div>
        </header>
        <div className="collection-view-shell__view">{children}</div>
      </div>
    </div>
  );
}
