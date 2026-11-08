'use client';

import { getTranslation } from '@payloadcms/translations';
import { useDocumentInfo, useField, useTranslation } from '@payloadcms/ui';
import { useEffect, useLayoutEffect, useRef } from 'react';

import { usePanelLayout } from './PanelConfig.client.js';

function fitHeight(input: HTMLTextAreaElement) {
  input.style.height = 'auto';
  input.style.height = `${input.scrollHeight}px`;
}

function TitleInput({ label, path }: { label: string; path: string }) {
  const { hasSavePermission, isTrashed } = useDocumentInfo();
  const { errorMessage, setValue, showError, value } = useField<string>({ path });
  const ref = useRef<HTMLTextAreaElement>(null);
  const text = typeof value === 'string' ? value : '';

  useLayoutEffect(() => {
    if (ref.current) fitHeight(ref.current);
  }, [text]);

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
    <div className={`fb-record-panel-title${showError ? ' fb-record-panel-title--error' : ''}`}>
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
        readOnly={!hasSavePermission || isTrashed}
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

/** The record's `useAsTitle` field as a large heading, edited in place. */
export function RecordPanelTitle() {
  const layout = usePanelLayout();
  const { i18n } = useTranslation();
  const path = layout?.titlePath;
  if (!layout || !path) return null;

  const field = layout.collectionConfig.fields.find((item) => 'name' in item && item.name === path);
  const label =
    field && 'label' in field && field.label
      ? getTranslation(field.label as string, i18n)
      : getTranslation(layout.collectionConfig.labels.singular, i18n);

  return <TitleInput label={label} path={path} />;
}
