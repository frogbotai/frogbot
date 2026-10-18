'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';

import ChevronDownIcon from '../icons/icons/ChevronDownIcon.js';
import { useNavAdapter } from './adapter.js';

export type NavSectionProps = {
  children: ReactNode;
  id: string;
  title: string;
};

type NavSectionPreference = {
  collapsed: boolean;
};

const baseClass = 'fb-nav-section';

const duration = 200;

export function NavSection({ children, id, title }: NavSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [contentHidden, setContentHidden] = useState(false);
  const previous = useRef(collapsed);
  const { preferences } = useNavAdapter();
  const latestPreferences = useRef(preferences);
  const contentId = `frogbot-nav-section-${id}`;
  const preferenceKey = `frogbot-nav-section:${id}`;

  useEffect(() => {
    latestPreferences.current = preferences;
  });

  useEffect(() => {
    let current = true;

    void latestPreferences.current.get<NavSectionPreference>(preferenceKey).then((preference) => {
      if (current) {
        setCollapsed(preference?.collapsed === true);
        setHydrated(true);
      }
    });

    return () => {
      current = false;
    };
  }, [preferenceKey]);

  useEffect(() => {
    if (previous.current === collapsed) return;

    previous.current = collapsed;

    const wait = hydrated ? duration : 0;

    setAnimating(wait > 0);
    if (!collapsed) setContentHidden(false);

    const timeout = setTimeout(() => {
      setAnimating(false);
      if (collapsed) setContentHidden(true);
    }, wait);

    return () => clearTimeout(timeout);
  }, [collapsed, hydrated]);

  const toggle = () => {
    const nextCollapsed = !collapsed;
    setCollapsed(nextCollapsed);
    void preferences.set<NavSectionPreference>(preferenceKey, { collapsed: nextCollapsed });
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
      <div
        aria-hidden={collapsed}
        className={[
          `${baseClass}__content`,
          !collapsed && `${baseClass}__content--open`,
          animating && `${baseClass}__content--animating`,
        ]
          .filter(Boolean)
          .join(' ')}
        id={contentId}
        style={{ transitionDuration: `${hydrated ? duration : 0}ms` }}
      >
        <div hidden={contentHidden}>
          <div className={`${baseClass}__scroll`}>{children}</div>
        </div>
      </div>
    </section>
  );
}
