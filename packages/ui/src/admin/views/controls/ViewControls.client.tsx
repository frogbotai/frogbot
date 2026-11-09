'use client';

import './ViewControls.css';

import { AnimateHeight, ListControls, useWindowInfo } from '@payloadcms/ui';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { SortBuilder } from './SortBuilder.client.js';

const baseClass = 'view-controls';

export type ViewControlsProps = React.ComponentProps<typeof ListControls> & {
  manualSortField?: string;
};

/**
 * Payload's list controls, plus the sort builder its Sort button opens. Payload 4 renders the
 * button but leaves the panel to the view. On a phone Payload drops `beforeActions`, so they join
 * the row of control buttons here instead of taking a row of their own.
 */
export const ViewControls: React.FC<ViewControlsProps> = ({ manualSortField, ...props }) => {
  const { beforeActions, collectionConfig, enableSort = false } = props;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [sortExpanded, setSortExpanded] = useState(false);
  const [actions, setActions] = useState<HTMLElement | null>(null);
  const {
    breakpoints: { s: smallBreak },
  } = useWindowInfo();

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const readSortExpanded = () => {
      const button = wrapper.querySelector('#toggle-list-sort');
      setSortExpanded(button?.getAttribute('aria-expanded') === 'true');
      setActions(wrapper.querySelector<HTMLElement>('.list-controls__actions'));
    };

    readSortExpanded();
    const observer = new MutationObserver(readSortExpanded);

    observer.observe(wrapper, {
      attributeFilter: ['aria-expanded'],
      attributes: true,
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className={baseClass} ref={wrapperRef}>
      <ListControls {...props} />
      {smallBreak && actions && beforeActions
        ? createPortal(
            <div className={`${baseClass}__toolbar`}>{beforeActions}</div>,
            actions,
            'view-controls-toolbar',
          )
        : null}
      {enableSort && (
        <AnimateHeight
          className={`${baseClass}__sort`}
          height={sortExpanded ? 'auto' : 0}
          id="list-controls-sort"
        >
          <SortBuilder
            collectionSlug={collectionConfig.slug}
            fields={collectionConfig.fields}
            manualField={manualSortField}
          />
        </AnimateHeight>
      )}
    </div>
  );
};
