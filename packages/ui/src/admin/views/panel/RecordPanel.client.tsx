'use client';

import './RecordPanel.css';

import {
  LoadingOverlay,
  toast,
  useConfig,
  useDocumentEvents,
  useModal,
  usePreferences,
  useServerFunctions,
  useTranslation,
} from '@payloadcms/ui';
import { formatAdminURL } from 'payload/shared';
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';

import { clampPanelWidth, getPanelPreferenceKey, PANEL_WIDTH } from './config.js';
import { PanelConfig } from './PanelConfig.client.js';
import { PanelFooterTarget } from './PanelSlots.client.js';
import { useRecordPanel } from './RecordPanelProvider.client.js';
import type { RenderRecordPanelArgs, RenderRecordPanelResult } from './renderRecordPanel.js';

const RENDER_RECORD_PANEL = 'frogbot-render-record-panel';
const PANEL_DRAWER_SLUG = 'fb-record-panel';

/** Below this viewport width the panel covers the view. */
export const PANEL_FULL_SCREEN_BELOW = 768;

const baseClass = 'fb-record-panel';

function usePanelWidth(collectionSlug: string, initial: number) {
  const { getPreference, setPreference } = usePreferences();
  const key = getPanelPreferenceKey(collectionSlug);
  const [width, setWidth] = useState(initial);

  useEffect(() => {
    let active = true;

    void getPreference<{ width?: number } | undefined>(key).then((value) => {
      if (active && typeof value?.width === 'number') setWidth(clampPanelWidth(value.width));
    });

    return () => {
      active = false;
    };
  }, [getPreference, key]);

  const save = (next: number) => void setPreference(key, { width: next });

  return { save, setWidth, width };
}

function isInsideOpenModal(target: Element | null): boolean {
  return Boolean(target?.closest('.payload__modal-item, [role="dialog"], .popup__content'));
}

/**
 * The record side panel beside a collection view: Payload's edit view for the open record,
 * rendered on the server, in a resizable column whose width is saved per user and collection.
 * Below 768 px it covers the view.
 */
export function RecordPanel({ viewRef }: { viewRef: React.RefObject<HTMLElement | null> }) {
  const panel = useRecordPanel();
  const { collectionSlug, settings, state } = panel;
  const { config, getEntityConfig } = useConfig();
  const drafts = Boolean(getEntityConfig({ collectionSlug }).versions?.drafts);
  const { t } = useTranslation();
  const { modalState } = useModal();
  const { serverFunction } = useServerFunctions();
  const { mostRecentUpdate } = useDocumentEvents();
  const [content, setContent] = useState<{ key: string; Panel: ReactNode }>();
  const [loading, setLoading] = useState(false);
  const asideRef = useRef<HTMLElement>(null);
  const [footer, setFooter] = useState<HTMLDivElement | null>(null);
  const panelRef = useRef(panel);
  const { save, setWidth, width } = usePanelWidth(
    collectionSlug,
    settings ? settings.width : PANEL_WIDTH.default,
  );

  useEffect(() => {
    panelRef.current = panel;
  });

  const requestKey =
    state.mode === 'edit'
      ? `edit:${state.id}:${state.version ?? 0}`
      : state.mode === 'create'
        ? `create:${state.key}`
        : '';

  useEffect(() => {
    const current = panelRef.current.state;

    if (current.mode === 'closed') {
      setContent(undefined);

      return;
    }

    const controller = new AbortController();
    const args: RenderRecordPanelArgs =
      current.mode === 'edit'
        ? { collectionSlug, id: current.id }
        : { collectionSlug, initialData: current.initialData };

    setLoading(true);

    void (serverFunction({ name: RENDER_RECORD_PANEL, args }) as Promise<RenderRecordPanelResult>)
      .then((result) => {
        if (controller.signal.aborted) return;

        if (!result || result.notFound) {
          toast.error(t('error:documentNotFound', { id: args.id ?? '' }));
          panelRef.current.reset();

          return;
        }

        setContent({ key: requestKey, Panel: result.Panel });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        toast.error(error instanceof Error ? error.message : t('error:unspecific'));
        panelRef.current.reset();
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [collectionSlug, requestKey, serverFunction, t]);

  useEffect(() => {
    if (!mostRecentUpdate || mostRecentUpdate.entitySlug !== collectionSlug) return;
    const current = panelRef.current;
    const doc = mostRecentUpdate.doc as { id?: number | string } | undefined;
    const id = doc?.id ?? mostRecentUpdate.id;
    if (id === undefined || id === null) return;

    const isCreate =
      current.state.mode === 'create' &&
      mostRecentUpdate.operation === 'create' &&
      (!mostRecentUpdate.drawerSlug || mostRecentUpdate.drawerSlug === PANEL_DRAWER_SLUG);

    const isUpdate = current.state.mode === 'edit' && String(id) === current.state.id;
    if (!isCreate && !isUpdate) return;

    if (isCreate) current.switchTo(id);

    void fetch(
      formatAdminURL({
        apiRoute: config.routes.api,
        path: `/${collectionSlug}/${encodeURIComponent(String(id))}?depth=1${drafts ? '&draft=true' : ''}`,
      }),
      { credentials: 'include' },
    )
      .then((response) => (response.ok ? response.json() : undefined))
      .then((saved: ({ id: number | string } & Record<string, unknown>) | undefined) => {
        if (saved) {
          panelRef.current.notify({
            doc: saved,
            operation: isCreate ? 'create' : 'update',
            type: 'saved',
          });
        }
      });
  }, [collectionSlug, config.routes.api, drafts, mostRecentUpdate]);

  const open = state.mode !== 'closed';
  const modalStateRef = useRef(modalState);

  useEffect(() => {
    modalStateRef.current = modalState;
  }, [modalState]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (Object.values(modalStateRef.current).some((modal) => modal?.isOpen)) return;
      const target = event.target as Element | null;
      if (target?.closest('[aria-expanded="true"], .rs__menu, .react-datepicker')) return;
      if (isInsideOpenModal(target)) return;
      window.setTimeout(() => panelRef.current.close(), 0);
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      const view = viewRef.current;
      if (!target || !view?.contains(target) || asideRef.current?.contains(target)) return;
      if (target.closest('[data-record-id], .fb-record, tbody tr, .popup, .popup__content')) return;
      panelRef.current.close();
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown, true);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open, viewRef]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.classList.toggle('collection-view--panel-open', open);
    view.style.setProperty('--fb-record-panel-width', `${width}px`);

    return () => view.classList.remove('collection-view--panel-open');
  }, [open, viewRef, width]);

  const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const right = asideRef.current?.getBoundingClientRect().right ?? window.innerWidth;
    let next = width;

    handle.setPointerCapture(event.pointerId);

    const move = (moveEvent: PointerEvent) => {
      next = clampPanelWidth(right - moveEvent.clientX);
      setWidth(next);
    };

    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      save(next);
    };

    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };

  const resizeWithKeys = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 48 : 16;
    const delta = event.key === 'ArrowLeft' ? step : event.key === 'ArrowRight' ? -step : 0;
    if (!delta) return;
    event.preventDefault();
    const next = clampPanelWidth(width + delta);
    setWidth(next);
    save(next);
  };

  if (!open) return null;

  return (
    <aside
      aria-label="Record"
      className={baseClass}
      ref={asideRef}
      style={{ '--fb-record-panel-width': `${width}px` } as React.CSSProperties}
    >
      <button
        aria-label={`Resize panel, ${width} px`}
        className={`${baseClass}__resize`}
        onKeyDown={resizeWithKeys}
        onPointerDown={startResize}
        type="button"
      />
      <div className={`${baseClass}__body`}>
        {content ? (
          <PanelFooterTarget value={footer}>
            <PanelConfig collectionSlug={collectionSlug} key={content.key}>
              {content.Panel}
            </PanelConfig>
          </PanelFooterTarget>
        ) : null}
        {loading ? <LoadingOverlay /> : null}
      </div>
      <div className={`${baseClass}__footer`} ref={setFooter} />
    </aside>
  );
}
