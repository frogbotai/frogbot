'use client';

import { useDocumentInfo, useFormModified } from '@payloadcms/ui';
import { cloneElement, createContext, isValidElement, type ReactNode, use, useEffect } from 'react';
import { createPortal } from 'react-dom';

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

/** The element under the panel's scrolling body that the `footer` slot renders into. */
export const PanelFooterTarget = createContext<HTMLElement | null>(null);

/**
 * Renders the `footer` slot pinned under the panel's scrolling body. It stays inside the form's
 * React tree, so its components read the form and document like any other slot. A form in the
 * footer submits only itself: React would otherwise carry its submit up to the record's form.
 */
export function PanelFooter({ children }: { children: ReactNode }) {
  const target = use(PanelFooterTarget);
  if (!target) return null;

  return createPortal(
    <div className="fb-record-panel__footer-content" onSubmit={(event) => event.stopPropagation()}>
      {children}
    </div>,
    target,
  );
}
