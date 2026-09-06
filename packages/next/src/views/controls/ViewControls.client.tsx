'use client';

import './ViewControls.css';

import { AnimateHeight, ListControls } from '@payloadcms/ui';
import { useEffect, useRef, useState } from 'react';

import { SortBuilder } from './SortBuilder.client.js';

export type ViewControlsProps = React.ComponentProps<typeof ListControls> & {
  enableGroupBy?: boolean;
};

export const ViewControls: React.FC<ViewControlsProps> = ({ enableGroupBy, ...props }) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [sortExpanded, setSortExpanded] = useState(false);
  const collectionConfig =
    enableGroupBy === false
      ? {
          ...props.collectionConfig,
          admin: { ...props.collectionConfig.admin, groupBy: false },
        }
      : props.collectionConfig;

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
    <div ref={wrapperRef}>
      <ListControls {...props} collectionConfig={collectionConfig} />
      {props.enableSort && (
        <AnimateHeight
          className="list-controls__sort"
          height={sortExpanded ? 'auto' : 0}
          id="list-controls-sort"
        >
          <SortBuilder collectionSlug={collectionConfig.slug} fields={collectionConfig.fields} />
        </AnimateHeight>
      )}
    </div>
  );
};
