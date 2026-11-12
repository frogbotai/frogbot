'use client';

import { type KeyboardEvent, type ReactNode, useRef } from 'react';

import { useRecordPanel } from './RecordPanelProvider.client.js';

const baseClass = 'fb-record-panel-tabs';

const tabId = (index: number | undefined) => `${baseClass}-tab-${index ?? 'details'}`;
const paneId = (index: number) => `${baseClass}-pane-${index}`;

/**
 * The panel's tab bar: Details, then the collection's tabs. Arrow keys, Home and End move
 * between tabs, as in the WAI-ARIA tabs pattern.
 */
export function RecordPanelTabList({ labels }: { labels: string[] }) {
  const { selectTab, tab } = useRecordPanel();
  const listRef = useRef<HTMLDivElement>(null);
  const tabs: Array<number | undefined> = [undefined, ...labels.map((_, index) => index)];

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const last = tabs.length - 1;
    const current = tabs.indexOf(tab);
    const moves: Record<string, number> = {
      ArrowLeft: current === 0 ? last : current - 1,
      ArrowRight: current === last ? 0 : current + 1,
      End: last,
      Home: 0,
    };

    const next = moves[event.key];

    if (next === undefined) return;
    event.preventDefault();
    selectTab(tabs[next]);
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };

  return (
    <div aria-label="Record tabs" className={baseClass} ref={listRef} role="tablist">
      {tabs.map((index) => {
        const selected = index === tab;

        return (
          <button
            aria-controls={index === undefined ? undefined : paneId(index)}
            aria-selected={selected}
            className={`${baseClass}__tab`}
            id={tabId(index)}
            key={index ?? 'details'}
            onClick={() => selectTab(index)}
            onKeyDown={onKeyDown}
            role="tab"
            tabIndex={selected ? 0 : -1}
            type="button"
          >
            {index === undefined ? 'Details' : labels[index]}
          </button>
        );
      })}
    </div>
  );
}

/** The collection's tab panes. Every pane stays mounted; only the open one shows. */
export function RecordPanelTabPanes({ panes }: { panes: ReactNode[] }) {
  const { tab } = useRecordPanel();

  return panes.map((pane, index) => (
    <div
      aria-labelledby={tabId(index)}
      className={`${baseClass}__pane`}
      hidden={index !== tab}
      id={paneId(index)}
      key={index}
      role="tabpanel"
    >
      {pane}
    </div>
  ));
}
