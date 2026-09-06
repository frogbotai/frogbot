'use client';

import './ViewControls.css';

import {
  AnimateHeight,
  ChevronIcon,
  ListControls,
  Pill,
  useListQuery,
  useTranslation,
  XIcon,
} from '@payloadcms/ui';
import type { Sort, Where } from 'payload';
import { transformWhereQuery, validateWhereQuery } from 'payload/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { parseSort, serializeSort } from '../Board/data.js';
import { SortBuilder } from './SortBuilder.client.js';

const baseClass = 'view-controls';

export type ViewControlsProps = React.ComponentProps<typeof ListControls> & {
  enableGroupBy?: boolean;
  manualSortField?: string;
};

type ViewControl = {
  active: boolean;
  count: number;
  key: string;
  label: string;
  onClear: () => void;
  targetID: string;
};

export function countWhereConditions(where?: Where): number {
  if (!where || typeof where !== 'object') return 0;
  const normalized = validateWhereQuery(where) ? where : transformWhereQuery(where);
  if (!validateWhereQuery(normalized)) return 0;
  return (normalized.or ?? []).reduce(
    (total, group) => total + (Array.isArray(group?.and) ? group.and.length : 0),
    0,
  );
}

export const ViewControls: React.FC<ViewControlsProps> = ({
  enableGroupBy,
  manualSortField,
  ...props
}) => {
  const { enableColumns = true, enableFilters = true, enableSort = false } = props;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [sortExpanded, setSortExpanded] = useState(false);
  const { t } = useTranslation();
  const { query, refineListData } = useListQuery();

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

  const toggleDrawer = useCallback((targetID: string) => {
    wrapperRef.current?.querySelector<HTMLElement>(`#${targetID}`)?.click();
  }, []);

  const groupByEnabled = Boolean(collectionConfig.admin?.groupBy);
  const groupBy = typeof query?.groupBy === 'string' ? query.groupBy : '';
  const groupByField = groupBy.replace(/^-/, '');

  const sortRows = parseSort(query?.sort as Sort | undefined);
  const sortValue = serializeSort(sortRows);
  const defaultSort = manualSortField ?? serializeSort(parseSort(collectionConfig.defaultSort));

  const filterCount = enableFilters ? countWhereConditions(query?.where) : 0;
  const groupByActive = groupByEnabled && Boolean(groupByField);
  const sortActive = enableSort && Boolean(sortValue) && sortValue !== defaultSort;

  const controls: ViewControl[] = [];

  if (enableColumns) {
    controls.push({
      active: false,
      count: 0,
      key: 'columns',
      label: t('general:columns'),
      onClear: () => void refineListData({ columns: [] }),
      targetID: 'toggle-list-columns',
    });
  }

  if (enableFilters) {
    controls.push({
      active: filterCount > 0,
      count: filterCount,
      key: 'filters',
      label: t('general:filters'),
      onClear: () => void refineListData({ where: {} }),
      targetID: 'toggle-list-filters',
    });
  }

  if (enableSort) {
    controls.push({
      active: sortActive,
      count: sortRows.length,
      key: 'sort',
      label: t('general:sort'),
      onClear: () => void refineListData({ page: 1, sort: manualSortField ?? '' }),
      targetID: 'toggle-list-sort',
    });
  }

  if (groupByEnabled) {
    controls.push({
      active: groupByActive,
      count: groupByActive ? 1 : 0,
      key: 'group-by',
      label: t('general:groupByLabel', { label: '' }).trim(),
      onClear: () => void refineListData({ groupBy: '' }),
      targetID: 'toggle-group-by',
    });
  }

  const renderControls = (placement: 'desktop' | 'mobile') =>
    controls.map((control) => (
      <Pill
        className={`${baseClass}__control ${control.active ? `${baseClass}__control--active` : ''}`}
        icon={!control.active ? <ChevronIcon /> : undefined}
        id={`view-controls-${placement}-${control.key}`}
        key={`view-controls-${placement}-${control.key}`}
        onClick={() => toggleDrawer(control.targetID)}
        pillStyle={control.active ? 'success' : 'light'}
        size="small"
      >
        <div className={`${baseClass}__control-content`}>
          <span>{control.active ? `${control.label}: ${control.count}` : control.label}</span>
          {control.active && (
            <div
              aria-label={t('general:clear')}
              className={`${baseClass}__control-clear`}
              id={`view-controls-${placement}-clear-${control.key}`}
              onClick={(event) => {
                event.stopPropagation();
                control.onClear();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  control.onClear();
                }
              }}
              role="button"
              tabIndex={0}
            >
              <XIcon />
            </div>
          )}
        </div>
      </Pill>
    ));

  const beforeActions = [...(props.beforeActions ?? []), ...renderControls('desktop')];

  return (
    <div className={baseClass} ref={wrapperRef}>
      <ListControls {...props} beforeActions={beforeActions} collectionConfig={collectionConfig} />
      <div className={`${baseClass}__mobile-controls`}>{renderControls('mobile')}</div>
      {enableSort && (
        <AnimateHeight
          className="list-controls__sort"
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
