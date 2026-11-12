'use client';

import { useForm, useFormProcessing } from '@payloadcms/ui';
import { type KeyboardEvent, type ReactNode, useEffect, useRef } from 'react';

import { useRecordPanel } from './RecordPanelProvider.client.js';

const baseClass = 'fb-record-panel-tabs';

const tabId = (index: number | undefined) => `${baseClass}-tab-${index ?? 'details'}`;
const paneId = (index: number | undefined) => `${baseClass}-pane-${index ?? 'details'}`;

/**
 * The panel's tab bar: Details, then the collection's tabs. Arrow keys, Home and End move
 * between tabs, as in the WAI-ARIA tabs pattern. A save that fails on invalid fields returns to
 * Details, where those fields are.
 */
export function RecordPanelTabList({ labels }: { labels: string[] }) {
  const { selectTab, setTabCount, tab } = useRecordPanel();
  const { getFields } = useForm();
  const processing = useFormProcessing();
  const wasProcessing = useRef(processing);
  const listRef = useRef<HTMLDivElement>(null);
  const tabs: Array<number | undefined> = [undefined, ...labels.map((_, index) => index)];

  useEffect(() => {
    setTabCount(labels.length);

    return () => setTabCount(0);
  }, [labels.length, setTabCount]);

  useEffect(() => {
    const finished = wasProcessing.current && !processing;
    wasProcessing.current = processing;

    if (
      finished &&
      tab !== undefined &&
      Object.values(getFields()).some(({ valid }) => valid === false)
    ) {
      selectTab(undefined);
    }
  }, [getFields, processing, selectTab, tab]);

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
            aria-controls={paneId(index)}
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

/** Wraps Details' own content; a tab panel for the Details tab when the record has tabs. */
export function RecordPanelDetails({ children, tabbed }: { children: ReactNode; tabbed: boolean }) {
  return (
    <div
      className="fb-record-panel__details"
      {...(tabbed
        ? { 'aria-labelledby': tabId(undefined), id: paneId(undefined), role: 'tabpanel' }
        : {})}
    >
      {children}
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
