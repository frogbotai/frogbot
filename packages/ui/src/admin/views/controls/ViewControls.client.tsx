'use client';

import './ViewControls.css';

import { AnimateHeight, ListControls } from '@payloadcms/ui';
import { useEffect, useRef, useState } from 'react';

import { SortBuilder } from './SortBuilder.client.js';

const baseClass = 'view-controls';

export type ViewControlsProps = React.ComponentProps<typeof ListControls> & {
  manualSortField?: string;
};

/**
 * Payload's list controls, plus the sort builder its Sort button opens. Payload 4 renders the
 * button but leaves the panel to the view.
 */
export const ViewControls: React.FC<ViewControlsProps> = ({ manualSortField, ...props }) => {
  const { collectionConfig, enableSort = false } = props;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [sortExpanded, setSortExpanded] = useState(false);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const readSortExpanded = () => {
      const button = wrapper.querySelector('#toggle-list-sort');
      setSortExpanded(button?.getAttribute('aria-expanded') === 'true');
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
