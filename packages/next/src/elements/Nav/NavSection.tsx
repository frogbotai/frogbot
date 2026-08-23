'use client';

import { ChevronDownIcon } from '@frogbotai/ui/icons';
import { AnimateHeight, usePreferences } from '@payloadcms/ui';
import { type ReactNode, useEffect, useState } from 'react';

export type NavSectionProps = {
  children: ReactNode;
  id: string;
  title: string;
};

type NavSectionPreference = {
  collapsed: boolean;
};

const baseClass = 'frogbot-nav-section';

export function NavSection({ children, id, title }: NavSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const { getPreference, setPreference } = usePreferences();
  const contentId = `frogbot-nav-section-${id}`;
  const preferenceKey = `frogbot-nav-section:${id}`;

  useEffect(() => {
    let current = true;
    void getPreference<NavSectionPreference | null>(preferenceKey).then((preference) => {
      if (current) {
        setCollapsed(preference?.collapsed === true);
        setHydrated(true);
      }
    });
    return () => {
      current = false;
    };
  }, [getPreference, preferenceKey]);

  const toggle = () => {
    const nextCollapsed = !collapsed;
    setCollapsed(nextCollapsed);
    void setPreference<NavSectionPreference>(preferenceKey, { collapsed: nextCollapsed });
  };

  return (
    <section
      className={[baseClass, collapsed && `${baseClass}--collapsed`].filter(Boolean).join(' ')}
    >
      <button
        aria-controls={contentId}
        aria-expanded={!collapsed}
        className={`${baseClass}__toggle`}
        disabled={!hydrated}
        onClick={toggle}
        type="button"
      >
        <span className={`${baseClass}__title`}>{title}</span>
        <ChevronDownIcon className={`${baseClass}__indicator`} size={16} />
      </button>
      <AnimateHeight duration={hydrated ? 200 : 0} height={collapsed ? 0 : 'auto'} id={contentId}>
        <div className={`${baseClass}__scroll`}>{children}</div>
      </AnimateHeight>
    </section>
  );
}
