'use client';

import {
  Button,
  ReactSelect,
  SelectInput,
  useAuth,
  useListQuery,
  useTranslation,
} from '@payloadcms/ui';
import { reduceFieldsToOptions } from '@payloadcms/ui/utilities/reduceFieldsToOptions';
import type { ClientField } from 'payload';
import React, { useEffect, useMemo, useState } from 'react';

import { parseSort, serializeSort, type SortRow, syncSortRows } from '../Board/data.js';

const baseClass = 'sort-builder';

const sortableFieldTypes = new Set([
  'text',
  'textarea',
  'code',
  'json',
  'number',
  'email',
  'radio',
  'select',
  'date',
]);

const emptyRow: SortRow = { direction: 'asc', field: '' };

export type SortBuilderProps = {
  readonly collectionSlug: string;
  readonly fields: ClientField[];
};

export const SortBuilder: React.FC<SortBuilderProps> = ({ collectionSlug, fields }) => {
  const { i18n, t } = useTranslation();
  const { permissions } = useAuth();
  const { query, refineListData } = useListQuery();

  const fieldPermissions = permissions?.collections?.[collectionSlug]?.fields;

  const reducedFields = useMemo(
    () =>
      reduceFieldsToOptions({ fieldPermissions, fields, i18n }).filter(
        (field) =>
          !field.field.admin?.disableListColumn && sortableFieldTypes.has(field.field.type),
      ),
    [fields, fieldPermissions, i18n],
  );

  const [rows, setRows] = useState<SortRow[]>(() => parseSort(query?.sort));

  useEffect(() => {
    setRows((currentRows) => syncSortRows(currentRows, query?.sort));
  }, [query?.sort]);

  const visibleRows = rows.length > 0 ? rows : [emptyRow];

  const update = (nextRows: SortRow[]) => {
    setRows(nextRows);
    void refineListData({
      page: 1,
      sort: serializeSort(nextRows.filter(({ field }) => field)),
    });
  };

  return (
    <div className={baseClass}>
      <div className={`${baseClass}__header`}>
        <p>{t('general:sort')}</p>
        {query?.sort && (
          <button
            className={`${baseClass}__clear-button`}
            id="sort--reset"
            onClick={() => update([])}
            type="button"
          >
            {t('general:clear')}
          </button>
        )}
      </div>
      {visibleRows.map((row, index) => {
        const selected = reducedFields.find((field) => field.value === row.field);

        return (
          <div className={`${baseClass}__row`} key={index}>
            <div className={`${baseClass}__inputs`}>
              <ReactSelect
                filterOption={(option, inputValue) =>
                  ((option?.data?.plainTextLabel as string) || option.label)
                    .toLowerCase()
                    .includes(inputValue.toLowerCase())
                }
                id={`sort--field-select-${index}`}
                isClearable
                isMulti={false}
                onChange={(option) => {
                  const next = Array.isArray(option) ? option[0] : option;
                  update(
                    visibleRows.map((item, i) =>
                      i === index ? { ...item, field: next ? String(next.value) : '' } : item,
                    ),
                  );
                }}
                options={reducedFields}
                value={{
                  label: selected?.label || t('general:selectValue'),
                  value: row.field,
                }}
              />
              <SelectInput
                id={`sort--direction-${index}`}
                isClearable={false}
                name="direction"
                onChange={(option) => {
                  const next = Array.isArray(option) ? option[0] : option;
                  if (next?.value !== 'asc' && next?.value !== 'desc') return;
                  update(
                    visibleRows.map((item, i) =>
                      i === index
                        ? { ...item, direction: next.value as SortRow['direction'] }
                        : item,
                    ),
                  );
                }}
                options={[
                  { label: t('general:ascending'), value: 'asc' },
                  { label: t('general:descending'), value: 'desc' },
                ]}
                path="direction"
                readOnly={!row.field}
                value={row.direction}
              />
            </div>
            <div className={`${baseClass}__actions`}>
              <Button
                buttonStyle="icon-label"
                className={`${baseClass}__actions-remove`}
                icon="x"
                iconStyle="with-border"
                onClick={() => update(visibleRows.filter((_, i) => i !== index))}
              />
              <Button
                buttonStyle="icon-label"
                className={`${baseClass}__actions-add`}
                icon="plus"
                iconStyle="with-border"
                onClick={() => setRows([...visibleRows, emptyRow])}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
