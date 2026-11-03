'use client';

import './styles.css';

import {
  Alert,
  AlertDescription,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@frogbotai/ui';
import {
  FieldLabel,
  useConfig,
  useDocumentInfo,
  useField,
  useFormFields,
} from '@frogbotai/ui/admin';
import type { JSONFieldClientProps } from 'payload';
import { useEffect, useRef, useState } from 'react';

import type {
  ImportColumn,
  ImportColumnMap,
  ImportColumnsFieldClientProps,
} from '../columns/columnMap.js';
import type { ImportTarget } from '../columns/suggest.js';
import type { ImportColumnsResponse } from '../endpoints/importColumns.js';
import type { SuggestColumnsResponse } from '../endpoints/suggestColumns.js';

export type ImportColumnsFieldProps = JSONFieldClientProps & Partial<ImportColumnsFieldClientProps>;

type ImportFile = { fileData: string; format: 'csv' | 'json' };

type Loaded = ImportFile & Omit<ImportColumnsResponse, 'columns' | 'headers'>;

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | ({ status: 'ready' } & Loaded);

const skip = '__skip';

const baseClass = 'import-columns';

const rootClass = `field-type ${baseClass}`;

/**
 * The import form's Columns section. After a file is chosen it lists each file column next to a
 * field picker, started from the last matching import or from header names, and writes the
 * mapping to `columnMap`. Relationship columns add a match-by picker and a create-missing switch.
 * A saved import shows its mapping read-only.
 */
export function ImportColumnsField({ ai = false, field, path, readOnly }: ImportColumnsFieldProps) {
  const fieldPath = path ?? field.name;
  const { config } = useConfig();
  const { id, collectionSlug: importsSlug } = useDocumentInfo();
  const { value, setValue } = useField<ImportColumnMap | null>({ path: fieldPath });
  const { value: collectionSlug } = useField<string>({ path: 'collectionSlug' });
  const file = useFormFields(([fields]) => fields?.file?.value);
  const [load, setLoad] = useState<LoadState>({ status: 'idle' });
  const [suggesting, setSuggesting] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string }>();
  const saved = id !== undefined && id !== null;
  const endpoint = `${config.routes.api}/${importsSlug}`;
  const setMapping = useRef(setValue);

  setMapping.current = setValue;

  useEffect(() => {
    if (saved || readOnly) return;

    if (!(file instanceof File) || !collectionSlug) {
      setLoad({ status: 'idle' });
      setMapping.current(null, true);

      return;
    }

    const controller = new AbortController();

    setLoad({ status: 'loading' });
    setNotice(undefined);

    void loadColumns({ endpoint, collectionSlug, file, signal: controller.signal })
      .then(({ columns, headers, ...loaded }) => {
        setLoad({ status: 'ready', ...loaded });
        setMapping.current({ headers, columns });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;

        setLoad({ status: 'error', message: messageOf(error) });
        setMapping.current(null, true);
      });

    return () => controller.abort();
  }, [collectionSlug, endpoint, file, readOnly, saved]);

  if (saved || readOnly) {
    return value?.columns?.length ? (
      <div className={rootClass}>
        <FieldLabel label={field.label ?? 'Columns'} />
        <ul className={`${baseClass}__summary`}>
          {value.columns.map((column) => (
            <li key={column.header}>
              <span className={`${baseClass}__header`}>{column.header}</span>
              {' → '}
              {describeColumn(column)}
            </li>
          ))}
        </ul>
      </div>
    ) : null;
  }

  if (load.status === 'idle') return null;

  if (load.status === 'loading') {
    return (
      <div className={rootClass}>
        <FieldLabel label={field.label ?? 'Columns'} />
        <p className={`${baseClass}__description`}>Reading the file's columns…</p>
      </div>
    );
  }

  if (load.status === 'error') {
    return (
      <div className={rootClass}>
        <FieldLabel label={field.label ?? 'Columns'} />
        <Alert variant="destructive">
          <AlertDescription>{load.message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const columns = value?.columns ?? [];
  const headers = value?.headers ?? columns.map(({ header }) => header);
  const skipped = columns.some((column) => column.field === null);

  function update(index: number, column: ImportColumn) {
    setValue({ headers, columns: columns.map((current, at) => (at === index ? column : current)) });
  }

  async function suggest(ready: Loaded) {
    setSuggesting(true);
    setNotice(undefined);

    try {
      const response = await fetch(`${endpoint}/suggest-columns`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collectionSlug,
          fileData: ready.fileData,
          format: ready.format,
          columns,
        }),
      });

      const result = (await response.json()) as Partial<SuggestColumnsResponse>;

      if (!response.ok || !result.columns) {
        setNotice({ error: true, text: result.error ?? 'AI suggestion failed.' });

        return;
      }

      setValue({ headers, columns: result.columns });
      setNotice({ error: false, text: suggestedText(result.suggested ?? 0) });
    } catch (error) {
      setNotice({ error: true, text: `AI suggestion failed: ${messageOf(error)}` });
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <div className={rootClass}>
      <div className={`${baseClass}__heading`}>
        <FieldLabel label={field.label ?? 'Columns'} />
        {ai && (
          <Button
            disabled={suggesting || !skipped}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => void suggest(load)}
          >
            {suggesting ? 'Suggesting…' : 'Suggest with AI'}
          </Button>
        )}
      </div>
      <p className={`${baseClass}__description`}>
        {load.source === 'previous'
          ? 'Started from your last import with these columns.'
          : 'Columns were matched to fields by name. Check them before importing.'}
      </p>
      {notice && (
        <Alert variant={notice.error ? 'destructive' : 'default'}>
          <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
      )}
      <table className={`${baseClass}__table`}>
        <thead>
          <tr>
            <th scope="col">File column</th>
            <th scope="col">Field</th>
            <th scope="col">Match by</th>
            <th scope="col">Create missing</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((column, index) => (
            <ColumnRow
              column={column}
              columns={columns}
              key={column.header}
              samples={load.samples[column.header] ?? []}
              targets={load.targets}
              onChange={(next) => update(index, next)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ColumnRow({
  column,
  columns,
  samples,
  targets,
  onChange,
}: {
  column: ImportColumn;
  columns: ImportColumn[];
  samples: unknown[];
  targets: ImportTarget[];
  onChange: (column: ImportColumn) => void;
}) {
  const target = targets.find(({ field }) => field === column.field);
  const relationship = target?.relationship;
  const used = new Set(columns.filter((other) => other !== column).map(({ field }) => field));
  const exported = column.field !== null && !target;

  function choose(field: string) {
    const chosen = targets.find((candidate) => candidate.field === field);

    if (field === skip || !chosen) {
      onChange({ header: column.header, field: field === skip ? null : field });

      return;
    }

    onChange(
      chosen.relationship
        ? {
            header: column.header,
            field,
            matchBy: chosen.relationship.defaultMatchBy,
            createMissing: false,
          }
        : { header: column.header, field },
    );
  }

  return (
    <tr>
      <th scope="row">
        <span className={`${baseClass}__header`}>{column.header}</span>
        {samples.length > 0 && (
          <span className={`${baseClass}__samples`}>{samples.map(String).join(', ')}</span>
        )}
      </th>
      <td>
        <Select value={column.field ?? skip} onValueChange={choose}>
          <SelectTrigger aria-label={`Field for "${column.header}"`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={skip}>Skip</SelectItem>
            {exported && <SelectItem value={column.field!}>{column.field}</SelectItem>}
            {targets.map((option) => (
              <SelectItem disabled={used.has(option.field)} key={option.field} value={option.field}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td>
        {relationship && (
          <Select
            value={column.matchBy ?? relationship.defaultMatchBy}
            onValueChange={(matchBy) =>
              onChange({
                ...column,
                matchBy,
                createMissing: matchBy !== 'id' && column.createMissing === true,
              })
            }
          >
            <SelectTrigger aria-label={`Match "${column.header}" by`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {relationship.matchBy.map((option) => (
                <SelectItem key={option.field} value={option.field}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </td>
      <td>
        {relationship && (
          <Switch
            aria-label={`Create missing for "${column.header}"`}
            checked={column.createMissing === true}
            disabled={column.matchBy === 'id'}
            size="sm"
            onCheckedChange={(createMissing) => onChange({ ...column, createMissing })}
          />
        )}
      </td>
    </tr>
  );
}

async function loadColumns({
  endpoint,
  collectionSlug,
  file,
  signal,
}: {
  endpoint: string;
  collectionSlug: string;
  file: File;
  signal: AbortSignal;
}): Promise<ImportColumnsResponse & ImportFile> {
  const format = file.type === 'text/csv' || file.name.endsWith('.csv') ? 'csv' : 'json';
  const fileData = toBase64(await file.arrayBuffer());

  const response = await fetch(`${endpoint}/import-columns`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ collectionSlug, fileData, format }),
    signal,
  });

  const result = (await response.json()) as ImportColumnsResponse & { error?: string };

  if (!response.ok) throw new Error(result.error ?? "Could not read the file's columns.");

  return { ...result, fileData, format };
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;

  let binary = '';

  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }

  return btoa(binary);
}

function describeColumn({ field, matchBy, createMissing }: ImportColumn): string {
  if (!field) return 'Skip';

  if (!matchBy) return field;

  return `${field}, matched by ${matchBy}${createMissing ? ', create missing' : ''}`;
}

function suggestedText(count: number): string {
  if (count === 0) return 'AI found no more columns to map.';

  return `AI mapped ${count} ${count === 1 ? 'column' : 'columns'}. Check them before importing.`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
