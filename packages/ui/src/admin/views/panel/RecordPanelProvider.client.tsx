'use client';

import {
  ConfirmationModal,
  toast,
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

/** What the form inside the panel reports: unsaved edits to guard, and the title for a back link. */
export type RecordPanelForm = { modified: boolean; title?: string };

/** How the open record got there: from the view behind the panel, or a link or reload with nothing behind it. */
export type RecordPanelOrigin = 'link' | 'view';

/** A record the panel was drilled into from, which its back link returns to. */
export type RecordPanelParent = {
  collection: string;
  id: string;
  origin: RecordPanelOrigin;
  title: string;
};

/** Options for `open`: a click's modifier keys, and `from: 'panel'` when a record opens from inside the panel. */
export type RecordPanelOpenOptions = Partial<
  Pick<MouseEvent, 'button' | 'ctrlKey' | 'metaKey' | 'shiftKey'>
> & { from?: 'panel' };

type RecordPanelState =
  | { id: string; mode: 'edit'; version?: number }
  | { initialData?: Data; key: number; mode: 'create' }
  | { mode: 'closed' };

export type RecordPanelContextValue = {
  /**
   * Returns to the parent the panel was drilled into from, asking first when the form has unsaved
   * edits. Parents deleted or no longer readable are skipped; with none left, the back link goes
   * away. When the check fails for another reason, the panel stays where it is.
   */
  back: () => void;
  /** Closes the panel, asking first when the form has unsaved edits. */
  close: () => void;
  collectionSlug: string;
  /** Opens a create form in the panel; the first save switches it to the new record. */
  create: (initialData?: Data) => void;
  /** Whether the collection has the panel. With `panel: false` records open their edit page. */
  enabled: boolean;
  /**
   * Runs `action`, first asking with the leave-without-saving confirm when the form has unsaved
   * edits. With `record`, it asks only when that record is open, and leaving renders the record
   * again without the edits, as before a cell edit on it.
   */
  guard: (action: () => void, record?: number | string) => void;
  /** Opens the open record's full edit page. */
  expand: () => void;
  /** Sends a panel save or delete to every view listening with `useRecordPanelEvents`. */
  notify: (event: RecordPanelEvent) => void;
  /**
   * Opens a record in the panel, switching from the open one. A Cmd, Ctrl, Shift or middle click
   * opens its edit page in a new tab instead. With `from: 'panel'` the open record becomes the
   * parent its back link returns to; any other open starts fresh.
   */
  open: (id: number | string, options?: RecordPanelOpenOptions) => void;
  /** The open record's id, while one is open. */
  openId?: string;
  /** Whether the open record came from the view, or from a link or reload with nothing behind it. */
  origin: RecordPanelOrigin;
  /** The record the back link returns to, when the panel was drilled into. */
  parent?: RecordPanelParent;
  /**
   * Renders the open record again after it changed elsewhere, as after a cell edit. Does nothing
   * when another record is open or the panel's form has unsaved edits.
   */
  reload: (id: number | string) => void;
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

function isNewTabClick(event?: RecordPanelOpenOptions) {
  return Boolean(event && (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1));
}

/**
 * Holds the record a collection view has open in the side panel, once for the whole view: the
 * open id lives in `?record=<id>`, so reload, Back and shared links reopen it, and opening or
 * switching replaces the history entry. Records opened from inside the panel stack up in memory
 * only, for its back link, so a reload or shared link starts fresh. Views open records with
 * `useRecordPanel().open` and hear about saves with `useRecordPanelEvents`.
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

  const [origin, setOrigin] = useState<RecordPanelOrigin>(recordParam ? 'link' : 'view');
  const [stack, setStack] = useState<RecordPanelParent[]>([]);
  const formRef = useRef<RecordPanelForm | undefined>(undefined);
  const pendingRef = useRef<(() => void) | undefined>(undefined);
  const listenersRef = useRef(new Set<(event: RecordPanelEvent) => void>());
  const createKeyRef = useRef(0);
  const navigationRef = useRef(0);

  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  });

  useEffect(() => {
    if (!enabled) return;

    const live = new URL(window.location.href).searchParams.get('record') ?? undefined;

    if (live !== recordParam) return;

    const current = stateRef.current;

    if (recordParam) {
      if (current.mode === 'edit' && current.id === recordParam) return;

      navigationRef.current += 1;
      setOrigin('link');
      setStack([]);
      setState({ id: recordParam, mode: 'edit' });

      return;
    }

    if (current.mode !== 'edit') return;

    navigationRef.current += 1;
    setStack([]);
    setState({ mode: 'closed' });
  }, [enabled, recordParam]);

  const go = useCallback(
    (
      next: RecordPanelState,
      parents: RecordPanelParent[] = [],
      nextOrigin: RecordPanelOrigin = 'view',
    ) => {
      navigationRef.current += 1;
      formRef.current = undefined;
      setStack(parents);
      setOrigin(nextOrigin);
      setState(next);
      replaceRecordParam(next.mode === 'edit' ? next.id : undefined);
    },
    [],
  );

  const rerender = useCallback((id: string) => {
    setState((current) =>
      current.mode === 'edit' && current.id === id
        ? { ...current, version: (current.version ?? 0) + 1 }
        : current,
    );
  }, []);

  const guard = useCallback<RecordPanelContextValue['guard']>(
    (action, record) => {
      const id = record === undefined ? undefined : String(record);
      const isOpen = id === undefined || (state.mode === 'edit' && state.id === id);

      if (!formRef.current?.modified || !isOpen) {
        action();

        return;
      }

      pendingRef.current =
        id === undefined
          ? action
          : () => {
              formRef.current = undefined;
              rerender(id);
              action();
            };

      openModal(LEAVE_MODAL);
    },
    [openModal, rerender, state],
  );

  const open = useCallback<RecordPanelContextValue['open']>(
    (rawId, options) => {
      const id = String(rawId);
      const url = editURL(adminRoute, collectionSlug, id);

      if (isNewTabClick(options)) {
        window.open(url, '_blank', 'noopener');

        return;
      }

      if (!enabled) {
        router.push(url);

        return;
      }

      if (state.mode === 'edit' && state.id === id) return;

      const parents =
        options?.from === 'panel' && state.mode === 'edit'
          ? [
              ...stack,
              {
                collection: collectionSlug,
                id: state.id,
                origin,
                title: formRef.current?.title ?? '',
              },
            ]
          : [];

      guard(() => go({ id, mode: 'edit' }, parents));
    },
    [adminRoute, collectionSlug, enabled, go, guard, origin, router, stack, state],
  );

  const back = useCallback(() => {
    if (!stack.length) return;

    guard(() => {
      const navigation = navigationRef.current;

      void (async () => {
        const remaining = [...stack];

        while (remaining.length) {
          const parent = remaining.pop()!;
          const response = await fetch(
            formatAdminURL({
              apiRoute: config.routes.api,
              path: `/${parent.collection}/${encodeURIComponent(parent.id)}?depth=0`,
            }),
            { credentials: 'include' },
          ).catch(() => undefined);

          if (navigationRef.current !== navigation) return;

          if (response?.ok) {
            go({ id: parent.id, mode: 'edit' }, remaining, parent.origin);

            return;
          }

          if (response?.status !== 403 && response?.status !== 404) {
            toast.error(t('error:unspecific'));

            return;
          }
        }

        setStack([]);
        setOrigin('link');
      })();
    });
  }, [config.routes.api, go, guard, stack, t]);

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

  const reload = useCallback(
    (id: number | string) => {
      if (!formRef.current?.modified) rerender(String(id));
    },
    [rerender],
  );

  const switchTo = useCallback((rawId: number | string) => {
    const id = String(rawId);

    navigationRef.current += 1;
    formRef.current = undefined;
    setState({ id, mode: 'edit' });
    replaceRecordParam(id);
  }, []);

  const expand = useCallback(() => {
    if (state.mode === 'closed') return;
    const url = editURL(adminRoute, collectionSlug, state.mode === 'edit' ? state.id : undefined);

    guard(() => {
      formRef.current = undefined;
      setStack([]);
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
      back,
      close,
      collectionSlug,
      create,
      enabled,
      expand,
      guard,
      notify,
      open,
      openId: state.mode === 'edit' ? state.id : undefined,
      origin,
      parent: stack.at(-1),
      reload,
      reset,
      setForm,
      settings,
      state,
      subscribe,
      switchTo,
    }),
    [
      back,
      close,
      collectionSlug,
      create,
      enabled,
      expand,
      guard,
      notify,
      open,
      origin,
      reload,
      reset,
      setForm,
      settings,
      stack,
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
  back: noop,
  close: noop,
  collectionSlug: '',
  create: noop,
  enabled: false,
  expand: noop,
  guard: (action) => action(),
  notify: noop,
  open: noop,
  origin: 'view',
  reload: noop,
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
