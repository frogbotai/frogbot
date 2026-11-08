'use client';

import './GroupSection.css';

import {
  Button,
  ChevronIcon,
  GroupByPageControls,
  ListSelection,
  SelectionProvider,
  TableSection,
  useConfig,
  useDocumentDrawer,
  usePreferences,
  useRouter,
} from '@payloadcms/ui';
import type { OptionColor } from 'frogbot';
import type { PaginatedDocs, ViewTypes, Where } from 'payload';
import { type ReactNode, useState } from 'react';

import { OptionPill } from '../../../components/option-pill.js';
import PlusSignIcon from '../../../icons/icons/PlusSignIcon.js';
import { toggleCollapsed } from '../groups/layout.js';

const baseClass = 'fb-list-group';

export type GroupSectionProps = {
  canCreate: boolean;
  children?: ReactNode;
  collapsed: boolean;
  collectionSlug: string;
  color?: OptionColor;
  count: number;
  /** The group's page of rows; absent while collapsed or empty. */
  data?: PaginatedDocs;
  groupKey: string;
  label: string;
  /** The preference that keeps the view's collapsed groups. */
  preferenceKey: string;
  /** The group's value as create data; absent for "No value". */
  prefill?: Record<string, unknown>;
  tableId: string;
  viewType?: ViewTypes;
  where: Where;
};

/**
 * One group of the grouped list, in Payload's table section: a header with a collapse chevron,
 * the label, the count, the group's selection and page controls, and "+ Add" prefilled with the
 * group's value. Collapsing is saved per user per view. Selecting across pages is off, because
 * Payload's bulk delete would drop the group's filter and delete matching rows in every group.
 */
export function GroupSection({
  canCreate,
  children,
  collapsed: initialCollapsed,
  collectionSlug,
  color,
  count,
  data,
  groupKey,
  label,
  preferenceKey,
  prefill,
  tableId,
  viewType,
  where,
}: GroupSectionProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const { setPreference } = usePreferences();
  const { getEntityConfig } = useConfig();
  const router = useRouter();
  const [CreateDrawer, , drawer] = useDocumentDrawer({ collectionSlug });
  const collectionConfig = getEntityConfig({ collectionSlug });
  const contentId = `${tableId}-content`;

  const toggle = async () => {
    const next = !collapsed;

    setCollapsed(next);

    await setPreference<Record<string, unknown>>(preferenceKey, (current) => ({
      ...current,
      collapsed: toggleCollapsed(current?.collapsed, groupKey, next),
    }));

    if (!next && !children && count > 0) router.refresh();
  };

  const docs = data?.docs ?? [];

  return (
    <TableSection
      className={[
        'table-wrap',
        'table-wrap--group-by',
        baseClass,
        collapsed && `${baseClass}--collapsed`,
      ]
        .filter(Boolean)
        .join(' ')}
      data-group-id={groupKey}
    >
      <SelectionProvider docs={docs} totalDocs={data?.totalDocs ?? 0}>
        <TableSection.Header className={`${baseClass}__header`}>
          <button
            aria-controls={contentId}
            aria-expanded={!collapsed}
            aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${label}`}
            className={`${baseClass}__toggle`}
            onClick={() => void toggle()}
            type="button"
          >
            <ChevronIcon direction={collapsed ? 'right' : 'down'} size={16} />
          </button>
          <h4 className={`${baseClass}__heading`}>
            {color ? <OptionPill color={color}>{label}</OptionPill> : label}
            <span className={`${baseClass}__count`}>{count}</span>
          </h4>
          {!collapsed && docs.length > 0 ? (
            <ListSelection
              collectionConfig={collectionConfig}
              label={label}
              modalPrefix={groupKey}
              showSelectAllAcrossPages={false}
              viewType={viewType}
              where={where}
            />
          ) : null}
          {!collapsed && data && data.totalPages > 1 ? (
            <GroupByPageControls data={data} groupByValue={groupKey} tableId={tableId} />
          ) : null}
          {canCreate ? (
            <Button
              aria-label={`Add to ${label}`}
              buttonStyle="ghost"
              className={`${baseClass}__add`}
              icon={<PlusSignIcon aria-hidden size={16} />}
              iconPosition="left"
              onClick={() => drawer.openDrawer()}
            >
              Add
            </Button>
          ) : null}
        </TableSection.Header>
        {!collapsed && children ? (
          <TableSection.Content>
            <div id={contentId}>{children}</div>
          </TableSection.Content>
        ) : (
          <div hidden id={contentId} />
        )}
      </SelectionProvider>
      {canCreate ? (
        <CreateDrawer
          initialData={prefill}
          redirectAfterCreate={false}
          onSave={() => {
            drawer.closeDrawer();
            router.refresh();
          }}
        />
      ) : null}
    </TableSection>
  );
}
