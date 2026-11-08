'use client';

import './ListSummary.css';

import { getTranslation } from '@payloadcms/translations';
import { Popup, PopupList, useConfig, useTableColumns, useTranslation } from '@payloadcms/ui';
import type { SummaryOperation } from 'frogbot';
import type { ClientField, Where } from 'payload';
import { formatAdminURL } from 'payload/shared';
import { type RefObject, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  buildSummaryRequest,
  formatSummary,
  getSummaryLabel,
  resolveSummary,
  type SummaryChoice,
  type SummaryChoices,
  type SummaryColumn,
} from './summary.js';
import { useListSummary } from './useListSummary.js';

const baseClass = 'fb-list-summary';

export type ListSummaryProps = {
  collectionSlug: string;
  /** The columns the aggregate can total, keyed by path, resolved on the server. */
  columns: Record<string, SummaryColumn>;
  containerRef: RefObject<HTMLElement | null>;
  defaults?: Record<string, SummaryOperation>;
  preferenceKey: string;
  saved: SummaryChoices;
  where?: Where;
};

function findTable(container: HTMLElement | null): HTMLTableElement | null {
  const tables = container?.querySelectorAll<HTMLTableElement>(
    '.table:not(.table--drag-preview) table',
  );

  return tables?.length ? tables[tables.length - 1] : null;
}

type TableTarget = { accessors: string[]; table: HTMLTableElement };

function readTarget(container: HTMLElement): TableTarget | null {
  const table = findTable(container);
  const header = table?.tHead?.rows[0];

  if (!table || !header) return null;

  return {
    accessors: Array.from(
      header.cells,
      (cell) => cell.dataset.column ?? cell.id.replace(/^heading-/, '').replace(/__/g, '.'),
    ),
    table,
  };
}

function useTableTarget(containerRef: RefObject<HTMLElement | null>): TableTarget | null {
  const [target, setTarget] = useState<TableTarget | null>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) return;

    const update = () =>
      setTarget((current) => {
        const next = readTarget(container);

        return current?.table === next?.table &&
          current?.accessors.join('\n') === next?.accessors.join('\n')
          ? current
          : next;
      });

    update();

    const observer = new MutationObserver(update);

    observer.observe(container, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [containerRef]);

  return target;
}

/**
 * The list's footer row: one total per column across every page, in a `<tfoot>` inside Payload's
 * table so it shares the columns' widths and horizontal scroll. Each cell's menu picks the total,
 * saved in the user's view preference.
 */
export function ListSummary({
  collectionSlug,
  columns,
  containerRef,
  defaults,
  preferenceKey,
  saved,
  where,
}: ListSummaryProps) {
  const { config } = useConfig();
  const { i18n } = useTranslation();
  const { columns: tableColumns } = useTableColumns();
  const target = useTableTarget(containerRef);
  const savedKey = JSON.stringify(saved);
  const [choices, setChoices] = useState(saved);

  useEffect(() => {
    setChoices(JSON.parse(savedKey) as SummaryChoices);
  }, [savedKey]);

  const accessors = target?.accessors ?? [];
  const fields = new Map(tableColumns.map((column) => [column.accessor, column.field]));
  const summary = resolveSummary({ columns, defaults, saved: choices });

  const values = useListSummary({
    api: config.routes.api,
    body: buildSummaryRequest({
      paths: accessors.filter((path) => columns[path]),
      summary,
      where,
    }),
    collectionSlug,
  });

  const choose = async (path: string, choice: SummaryChoice) => {
    const next = { ...choices };

    if (choice === (defaults?.[path] ?? 'none')) delete next[path];
    else next[path] = choice;

    setChoices(next);

    const url = formatAdminURL({
      apiRoute: config.routes.api,
      path: `/payload-preferences/${preferenceKey}`,
    });

    const current = await fetch(url, { credentials: 'include' });
    const stored: unknown = current.ok ? ((await current.json()) as { value?: unknown }).value : {};
    const value = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    const { summary: _summary, ...rest } = value as Record<string, unknown>;

    await fetch(url, {
      body: JSON.stringify({
        value: { ...rest, ...(Object.keys(next).length ? { summary: next } : {}) },
      }),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
  };

  if (!target || !Object.keys(columns).length) return null;

  return createPortal(
    <tfoot className={baseClass}>
      <tr aria-label="Summary">
        {accessors.map((accessor, index) => {
          const column = columns[accessor];
          const field = fields.get(accessor);

          if (!column) return <td className={`${baseClass}__cell`} key={accessor || index} />;

          const operation = summary[accessor];

          return (
            <td className={`${baseClass}__cell`} key={accessor}>
              <SummaryCell
                column={column}
                field={field}
                onChoose={(choice) => void choose(accessor, choice)}
                operation={operation}
                path={accessor}
                value={
                  operation && values
                    ? formatSummary({
                        dateFormat: config.admin.dateFormat,
                        field,
                        i18n,
                        kind: column.kind,
                        operation,
                        value: values[accessor],
                      })
                    : ''
                }
              />
            </td>
          );
        })}
      </tr>
    </tfoot>,
    target.table,
  );
}

function SummaryCell({
  column,
  field,
  onChoose,
  operation,
  path,
  value,
}: {
  column: SummaryColumn;
  field?: ClientField;
  onChoose: (choice: SummaryChoice) => void;
  operation?: SummaryOperation;
  path: string;
  value: string;
}) {
  const { i18n } = useTranslation();
  const label = field && 'label' in field ? field.label : undefined;
  const name =
    typeof label === 'string' || (label && typeof label === 'object')
      ? getTranslation(label, i18n)
      : path;

  const title = operation ? getSummaryLabel(operation, column.kind) : 'Summarize';

  return (
    <Popup
      button={
        <button
          className={`${baseClass}__button${operation ? '' : ` ${baseClass}__button--empty`}`}
          type="button"
        >
          <span className={`${baseClass}__label`}>{title}</span>
          {value ? <span className={`${baseClass}__value`}>{value}</span> : null}
        </button>
      }
      buttonAriaLabel={`${name}: ${[title, value].filter(Boolean).join(' ')}`}
      buttonType="custom"
      className={`${baseClass}__popup`}
      horizontalAlign="left"
      id={`list-summary-${path.replace(/\./g, '__')}`}
      popupType="menu"
      render={({ close }) => (
        <PopupList.ButtonGroup>
          {[...column.operations, 'none' as const].map((choice) => (
            <PopupList.Button
              active={(operation ?? 'none') === choice}
              key={choice}
              onClick={() => {
                onChoose(choice);
                close();
              }}
            >
              {choice === 'none' ? 'None' : getSummaryLabel(choice, column.kind)}
            </PopupList.Button>
          ))}
        </PopupList.ButtonGroup>
      )}
      verticalAlign="top"
    />
  );
}
