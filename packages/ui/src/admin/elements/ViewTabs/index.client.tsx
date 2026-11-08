'use client';

import './index.css';

import {
  ChevronIcon,
  Popup,
  PopupList,
  usePreferences,
  useRouter,
  useWindowInfo,
} from '@payloadcms/ui';
import type { MouseEvent, ReactNode } from 'react';

import { getLastViewPreferenceKey } from '../../views/preferences.js';

const baseClass = 'fb-view-tabs';

/** One tab in a collection's view row. */
export type ViewTab = {
  active: boolean;
  href: string;
  icon?: ReactNode;
  label: string;
  /** Set on the collection's own views, so opening the collection again returns to the last one. */
  remember?: boolean;
  slug: string;
};

export type ViewTabsProps = {
  collectionSlug: string;
  tabs: ViewTab[];
};

/**
 * A collection's views as a row of tabs under the title, one per view, then Trash. Each tab is a
 * link to its view's route. Below Payload's small breakpoint the row becomes one menu.
 */
export function ViewTabs({ collectionSlug, tabs }: ViewTabsProps) {
  const { setPreference } = usePreferences();
  const router = useRouter();
  const {
    breakpoints: { s: smallBreak },
  } = useWindowInfo();

  if (tabs.length < 2) return null;

  const open = async (tab: ViewTab, event?: MouseEvent) => {
    if (event && (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)) return;
    event?.preventDefault();

    if (tab.remember) {
      await setPreference(getLastViewPreferenceKey(collectionSlug), { view: tab.slug });
    }

    router.push(tab.href);
  };

  const active = tabs.find((tab) => tab.active);

  if (smallBreak) {
    return (
      <nav aria-label="Collection views" className={`${baseClass} ${baseClass}--menu`}>
        <Popup
          button={
            <span className={`${baseClass}__menu-button`}>
              {active?.icon}
              <span className={`${baseClass}__label`}>{active?.label ?? tabs[0]?.label}</span>
              <ChevronIcon size={16} />
            </span>
          }
          buttonAriaLabel="Collection views"
          className={`${baseClass}__popup`}
          horizontalAlign="left"
          id="collection-views"
          popupType="menu"
          verticalAlign="bottom"
        >
          <PopupList.ButtonGroup>
            {tabs.map((tab) => (
              <PopupList.Button
                active={tab.active}
                ariaCurrent={tab.active ? 'page' : undefined}
                icon={tab.icon}
                key={tab.slug}
                onClick={() => void open(tab)}
              >
                {tab.label}
              </PopupList.Button>
            ))}
          </PopupList.ButtonGroup>
        </Popup>
      </nav>
    );
  }

  return (
    <nav aria-label="Collection views" className={baseClass}>
      {tabs.map((tab) => (
        <a
          aria-current={tab.active ? 'page' : undefined}
          className={`${baseClass}__tab${tab.active ? ` ${baseClass}__tab--active` : ''}`}
          href={tab.href}
          key={tab.slug}
          onClick={(event) => void open(tab, event)}
        >
          {tab.icon}
          <span className={`${baseClass}__label`}>{tab.label}</span>
        </a>
      ))}
    </nav>
  );
}
