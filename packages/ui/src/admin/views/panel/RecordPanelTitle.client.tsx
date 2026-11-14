'use client';

import { getTranslation } from '@payloadcms/translations';
import { useDocumentInfo, useField, useTranslation } from '@payloadcms/ui';
import type { ClientField } from 'payload';
import { getFieldPermissions } from 'payload/shared';
import { useEffect, useLayoutEffect, useRef } from 'react';

import { getUseAsDone } from '../records/state.js';
import { usePanelLayout } from './PanelConfig.client.js';

function fitHeight(input: HTMLTextAreaElement) {
  input.style.height = 'auto';
  input.style.height = `${input.scrollHeight}px`;
}

function TitleInput({
  compact,
  field,
  label,
  path,
}: {
  compact: boolean;
  field: ClientField | undefined;
  label: string;
  path: string;
}) {
  const { docPermissions, hasSavePermission, id, isTrashed } = useDocumentInfo();
  const canEdit =
    !field ||
    getFieldPermissions({
      field,
      operation: id === undefined || id === null ? 'create' : 'update',
      parentName: '',
      permissions: docPermissions?.fields ?? true,
    }).operation;

  const readOnly =
    Boolean(field && 'admin' in field && field.admin?.readOnly) ||
    !canEdit ||
    !hasSavePermission ||
    isTrashed;

  const { errorMessage, setValue, showError, value } = useField<string>({ path });
  const ref = useRef<HTMLTextAreaElement>(null);
  const text = typeof value === 'string' ? value : '';

  useLayoutEffect(() => {
    if (ref.current) fitHeight(ref.current);
  }, [compact, text]);

  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    let width = input.clientWidth;
    const observer = new ResizeObserver(() => {
      if (input.clientWidth === width) return;
      width = input.clientWidth;
      fitHeight(input);
    });

    observer.observe(input);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={[
        'fb-record-panel-title',
        compact && 'fb-record-panel-title--compact',
        showError && 'fb-record-panel-title--error',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <textarea
        aria-invalid={showError || undefined}
        aria-label={label}
        className="fb-record-panel-title__input"
        id={`field-${path.replaceAll('.', '__')}`}
        name={path}
        onChange={(event) => setValue(event.target.value.replaceAll('\n', ' '))}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.preventDefault();
        }}
        placeholder={label}
        readOnly={readOnly}
        ref={ref}
        rows={1}
        value={text}
      />
      {showError && errorMessage ? (
        <p className="fb-record-panel-title__error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The record's `useAsTitle` field as a large heading, edited in place. `compact` shrinks it to
 * the size the header uses once the body scrolls.
 */
export function RecordPanelTitle({ compact = false }: { compact?: boolean }) {
  const layout = usePanelLayout();
  const { i18n } = useTranslation();
  const path = layout?.titlePath;
  if (!layout || !path) return null;

  const field = layout.collectionConfig.fields.find((item) => 'name' in item && item.name === path);
  const label =
    field && 'label' in field && field.label
      ? getTranslation(field.label as string, i18n)
      : getTranslation(layout.collectionConfig.labels.singular, i18n);

  return <TitleInput compact={compact} field={field} label={label} path={path} />;
}

/**
 * The title in the panel body, under the default header. Only collections with `useAsDone` show
 * it there: for the rest, the header holds the title, so it isn't shown twice.
 */
export function RecordPanelBodyTitle() {
  const layout = usePanelLayout();
  if (!layout || !getUseAsDone(layout.collectionConfig)) return null;

  return <RecordPanelTitle />;
}
