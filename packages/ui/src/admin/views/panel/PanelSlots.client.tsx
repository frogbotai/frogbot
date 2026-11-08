'use client';

import { useDocumentInfo, useFormModified } from '@payloadcms/ui';
import { cloneElement, isValidElement, type ReactNode, useEffect } from 'react';

import { useRecordPanel } from './RecordPanelProvider.client.js';

/** Hands a client panel component `close` and `expand`, which can't cross from the server. */
export function PanelClientSlot({ children }: { children: ReactNode }) {
  const { close, collectionSlug, expand, openId } = useRecordPanel();
  const { id } = useDocumentInfo();

  if (!isValidElement<Record<string, unknown>>(children)) return children;

  return cloneElement(children, { close, collectionSlug, expand, id: id ?? openId ?? '' });
}

/** Tells the panel whether its form has unsaved edits, so switching and closing can ask first. */
export function PanelBridge() {
  const { setForm } = useRecordPanel();
  const modified = useFormModified();

  useEffect(() => {
    setForm({ modified });
  }, [modified, setForm]);

  useEffect(() => () => setForm(undefined), [setForm]);

  return null;
}
