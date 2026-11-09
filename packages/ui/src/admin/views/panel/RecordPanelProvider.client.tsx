'use client';

import {
  ConfirmationModal,
  useConfig,
  useModal,
  useRouter,
  useSearchParams,
  useTranslation,
} from '@payloadcms/ui';
import type { Data } from 'payload';
import { formatAdminURL } from 'payload/shared';
import {
  createContext,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { shallowRouteState } from '../../utilities/shallowRoute.js';
import { getPanelSettings, type PanelSettings } from './config.js';

/** A save or delete the panel made, so views can update the record behind it. */
export type RecordPanelEvent =
  | { doc: Data & { id: number | string }; operation: 'create' | 'update'; type: 'saved' }
  | { id: number | string; type: 'deleted' };

/** What the form inside the panel reports, so the panel can guard unsaved edits. */
export type RecordPanelForm = { modified: boolean };

type RecordPanelState =
  | { id: string; mode: 'edit' }
  | { initialData?: Data; key: number; mode: 'create' }
  | { mode: 'closed' };

export type RecordPanelContextValue = {
  /** Closes the panel, asking first when the form has unsaved edits. */
  close: () => void;
  collectionSlug: string;
  /** Opens a create form in the panel; the first save switches it to the new record. */
  create: (initialData?: Data) => void;
  /** Whether the collection has the panel. With `panel: false` records open their edit page. */
  enabled: boolean;
  /** Runs `action`, first asking with the leave-without-saving confirm when the form has unsaved edits. */
  guard: (action: () => void) => void;
  /** Opens the open record's full edit page. */
  expand: () => void;
  /** Sends a panel save or delete to every view listening with `useRecordPanelEvents`. */
  notify: (event: RecordPanelEvent) => void;
  /**
   * Opens a record in the panel, switching from the open one. A Cmd, Ctrl, Shift or middle click
   * opens its edit page in a new tab instead.
   */
  open: (
    id: number | string,
    event?: Pick<MouseEvent, 'button' | 'ctrlKey' | 'metaKey' | 'shiftKey'>,
  ) => void;
  /** The open record's id, while one is open. */
  openId?: string;
  /** Closes the panel without asking, as after a delete or a missing record. */
  reset: () => void;
  settings: PanelSettings;
  /** Called by the form inside the panel with its unsaved state. */
  setForm: (form: RecordPanelForm | undefined) => void;
  state: RecordPanelState;
  subscribe: (listener: (event: RecordPanelEvent) => void) => () => void;
  /** Re-renders the open record, as after a duplicate. */
  switchTo: (id: number | string) => void;
};

const RecordPanelContext = createContext<RecordPanelContextValue | undefined>(undefined);

const LEAVE_MODAL = 'fb-record-panel-leave';

function editURL(adminRoute: string, collectionSlug: string, id?: number | string): string {
  return formatAdminURL({
    adminRoute,
    path: `/collections/${collectionSlug}/${id === undefined ? 'create' : encodeURIComponent(String(id))}`,
  });
}

function replaceRecordParam(id: string | undefined) {
  const url = new URL(window.location.href);
  if ((url.searchParams.get('record') ?? undefined) === id) return;
  if (id === undefined) url.searchParams.delete('record');
  else url.searchParams.set('record', id);

  window.history.replaceState({ [shallowRouteState]: true }, '', `${url.pathname}${url.search}`);
}

function isNewTabClick(event?: Pick<MouseEvent, 'button' | 'ctrlKey' | 'metaKey' | 'shiftKey'>) {
  return Boolean(event && (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1));
}

/**
 * Holds the record a collection view has open in the side panel, once for the whole view: the
 * open id lives in `?record=<id>`, so reload, Back and shared links reopen it, and opening or
 * switching replaces the history entry. Views open records with `useRecordPanel().open` and
 * hear about saves with `useRecordPanelEvents`.
 */
export function RecordPanelProvider({
  children,
  collectionSlug,
}: {
  children: ReactNode;
  collectionSlug: string;
}) {
  const { config, getEntityConfig } = useConfig();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const { closeModal, openModal } = useModal();
  const adminRoute = config.routes.admin;
  const settings = getPanelSettings(getEntityConfig({ collectionSlug }));
  const enabled = settings !== false;
  const recordParam = searchParams.get('record') ?? undefined;

  const [state, setState] = useState<RecordPanelState>(() =>
    enabled && recordParam ? { id: recordParam, mode: 'edit' } : { mode: 'closed' },
  );

  const formRef = useRef<RecordPanelForm | undefined>(undefined);
  const pendingRef = useRef<(() => void) | undefined>(undefined);
  const listenersRef = useRef(new Set<(event: RecordPanelEvent) => void>());
  const createKeyRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    setState((current) => {
      if (recordParam) {
        return current.mode === 'edit' && current.id === recordParam
          ? current
          : { id: recordParam, mode: 'edit' };
      }

      return current.mode === 'edit' ? { mode: 'closed' } : current;
    });
  }, [enabled, recordParam]);

  const go = useCallback((next: RecordPanelState) => {
    formRef.current = undefined;
    setState(next);
    replaceRecordParam(next.mode === 'edit' ? next.id : undefined);
  }, []);

  const guard = useCallback(
    (action: () => void) => {
      if (formRef.current?.modified) {
        pendingRef.current = action;
        openModal(LEAVE_MODAL);

        return;
      }

      action();
    },
    [openModal],
  );

  const open = useCallback<RecordPanelContextValue['open']>(
    (rawId, event) => {
      const id = String(rawId);
      const url = editURL(adminRoute, collectionSlug, id);

      if (isNewTabClick(event)) {
        window.open(url, '_blank', 'noopener');

        return;
      }

      if (!enabled) {
        router.push(url);

        return;
      }

      if (state.mode === 'edit' && state.id === id) return;
      guard(() => go({ id, mode: 'edit' }));
    },
    [adminRoute, collectionSlug, enabled, go, guard, router, state],
  );

  const create = useCallback<RecordPanelContextValue['create']>(
    (initialData) => {
      if (!enabled) {
        router.push(editURL(adminRoute, collectionSlug));

        return;
      }

      guard(() => {
        createKeyRef.current += 1;
        go({ initialData, key: createKeyRef.current, mode: 'create' });
      });
    },
    [adminRoute, collectionSlug, enabled, go, guard, router],
  );

  const close = useCallback(() => {
    if (state.mode === 'closed') return;
    guard(() => go({ mode: 'closed' }));
  }, [go, guard, state.mode]);

  const reset = useCallback(() => go({ mode: 'closed' }), [go]);

  const switchTo = useCallback((id: number | string) => go({ id: String(id), mode: 'edit' }), [go]);

  const expand = useCallback(() => {
    if (state.mode === 'closed') return;
    const url = editURL(adminRoute, collectionSlug, state.mode === 'edit' ? state.id : undefined);

    guard(() => {
      formRef.current = undefined;
      router.push(url);
    });
  }, [adminRoute, collectionSlug, guard, router, state]);

  const notify = useCallback((event: RecordPanelEvent) => {
    for (const listener of listenersRef.current) listener(event);
  }, []);

  const subscribe = useCallback((listener: (event: RecordPanelEvent) => void) => {
    listenersRef.current.add(listener);

    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const setForm = useCallback((form: RecordPanelForm | undefined) => {
    formRef.current = form;
  }, []);

  const value = useMemo<RecordPanelContextValue>(
    () => ({
      close,
      collectionSlug,
      create,
      enabled,
      expand,
      guard,
      notify,
      open,
      openId: state.mode === 'edit' ? state.id : undefined,
      reset,
      setForm,
      settings,
      state,
      subscribe,
      switchTo,
    }),
    [
      close,
      collectionSlug,
      create,
      enabled,
      expand,
      guard,
      notify,
      open,
      reset,
      setForm,
      settings,
      state,
      subscribe,
      switchTo,
    ],
  );

  return (
    <RecordPanelContext value={value}>
      {children}
      <ConfirmationModal
        body={t('general:changesNotSaved')}
        cancelLabel={t('general:stayOnThisPage')}
        confirmLabel={t('general:leaveAnyway')}
        heading={t('general:leaveWithoutSaving')}
        modalSlug={LEAVE_MODAL}
        onCancel={() => {
          pendingRef.current = undefined;
          closeModal(LEAVE_MODAL);
        }}
        onConfirm={() => {
          const action = pendingRef.current;
          pendingRef.current = undefined;
          closeModal(LEAVE_MODAL);
          action?.();
        }}
      />
    </RecordPanelContext>
  );
}

const noop = () => undefined;

const CLOSED: RecordPanelContextValue = {
  close: noop,
  collectionSlug: '',
  create: noop,
  enabled: false,
  expand: noop,
  guard: (action) => action(),
  notify: noop,
  open: noop,
  reset: noop,
  setForm: noop,
  settings: false,
  state: { mode: 'closed' },
  subscribe: () => noop,
  switchTo: noop,
};

/**
 * The record panel of the collection view around the caller: `open`, `create`, `close`,
 * `expand` and the open id. Outside a collection view it does nothing.
 */
export function useRecordPanel(): RecordPanelContextValue {
  return use(RecordPanelContext) ?? CLOSED;
}

/** Calls `listener` with each save and delete made in the panel. */
export function useRecordPanelEvents(listener: (event: RecordPanelEvent) => void): void {
  const { subscribe } = useRecordPanel();
  const ref = useRef(listener);

  useEffect(() => {
    ref.current = listener;
  });

  useEffect(() => subscribe((event) => ref.current(event)), [subscribe]);
}

/** A click handler that opens a record in the panel, or its edit page in a new tab. */
export function useOpenRecord(): (id: number | string) => (event: ReactMouseEvent) => void {
  const { open } = useRecordPanel();

  return useCallback(
    (id: number | string) => (event: ReactMouseEvent) => {
      if (event.button !== 0 && event.button !== 1) return;
      open(id, event.nativeEvent);
    },
    [open],
  );
}
