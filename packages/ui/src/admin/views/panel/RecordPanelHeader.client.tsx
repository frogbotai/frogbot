'use client';

import { getTranslation } from '@payloadcms/translations';
import {
  Button,
  ConfirmationModal,
  toast,
  useAuth,
  useConfig,
  useDocumentInfo,
  useDocumentTitle,
  useField,
  useForm,
  useFormModified,
  useModal,
  useTranslation,
} from '@payloadcms/ui';
import { formatAdminURL } from 'payload/shared';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { DropdownMenuSeparator } from '../../../components/dropdown-menu.js';
import {
  SidePanelBar,
  SidePanelMenuItem,
  SidePanelMenuNote,
} from '../../../components/side-panel-bar.js';
import CheckIcon from '../../../icons/icons/CheckIcon.js';
import CheckmarkCircleIcon from '../../../icons/icons/CheckmarkCircleIcon.js';
import { getUseAsDone } from '../records/state.js';
import { usePanelLayout } from './PanelConfig.client.js';
import { useRecordPanel } from './RecordPanelProvider.client.js';
import { recordPanelStatus } from './status.js';

const baseClass = 'fb-record-panel-header';

function useTitleScrolledOut(ref: React.RefObject<HTMLElement | null>): boolean {
  const [scrolledOut, setScrolledOut] = useState(false);

  useEffect(() => {
    const header = ref.current;
    const body = header?.closest('.fb-record-panel__body');
    if (!header || !body) return;

    const update = () => {
      const title = body.querySelector('.fb-record-panel-title');

      setScrolledOut(
        Boolean(title) &&
          title!.getBoundingClientRect().bottom <= header.getBoundingClientRect().bottom,
      );
    };

    update();
    body.addEventListener('scroll', update, { passive: true });

    return () => body.removeEventListener('scroll', update);
  }, [ref]);

  return scrolledOut;
}

function MarkComplete({ onToggle, path }: { onToggle: () => void; path: string }) {
  const { hasSavePermission } = useDocumentInfo();
  const { setValue, value } = useField<boolean>({ path });
  const done = value === true;

  return (
    <button
      aria-label={done ? 'Completed' : 'Mark complete'}
      aria-pressed={done}
      className={[`${baseClass}__complete`, done && `${baseClass}__complete--done`]
        .filter(Boolean)
        .join(' ')}
      disabled={!hasSavePermission}
      onClick={() => {
        setValue(!done);
        onToggle();
      }}
      title={done ? 'Completed' : 'Mark complete'}
      type="button"
    >
      <CheckIcon aria-hidden className={`${baseClass}__complete-check`} size={14} />
      <CheckmarkCircleIcon aria-hidden className={`${baseClass}__complete-icon`} size={18} />
      <span className={`${baseClass}__complete-label`}>{done ? 'Completed' : 'Mark complete'}</span>
    </button>
  );
}

function Emphasized({ text }: { text: string }) {
  const [before, rest = ''] = text.split('<1>');
  const [strong, after = ''] = rest.split('</1>');

  return (
    <p>
      {before}
      <strong>{strong}</strong>
      {after}
    </p>
  );
}

function deleteModalSlug(collectionSlug: string | undefined): string {
  return `fb-record-panel-delete-${collectionSlug}`;
}

function DeleteRecord({ onDeleted }: { onDeleted: () => void }) {
  const { i18n, t } = useTranslation();
  const { config, getEntityConfig } = useConfig();
  const { closeModal } = useModal();
  const { collectionSlug, id } = useDocumentInfo();
  const { title } = useDocumentTitle();
  const collectionConfig = getEntityConfig({ collectionSlug: collectionSlug ?? '' });
  const modalSlug = deleteModalSlug(collectionSlug);
  const label = getTranslation(collectionConfig.labels.singular, i18n);
  const trash = Boolean(collectionConfig.trash);

  const confirm = async () => {
    const url = formatAdminURL({
      apiRoute: config.routes.api,
      path: `/${collectionSlug}/${encodeURIComponent(String(id))}`,
    });

    const response = await fetch(url, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...(trash
        ? { body: JSON.stringify({ deletedAt: new Date().toISOString() }), method: 'PATCH' }
        : { method: 'DELETE' }),
    });

    closeModal(modalSlug);

    if (!response.ok) {
      const result = (await response.json().catch(() => ({}))) as {
        errors?: { message?: string }[];
      };

      toast.error(result.errors?.[0]?.message ?? t('error:deletingTitle', { title }));

      return;
    }

    toast.success(t(trash ? 'general:titleTrashed' : 'general:titleDeleted', { label, title }));
    onDeleted();
  };

  return (
    <ConfirmationModal
      body={
        <Emphasized
          text={t(trash ? 'general:aboutToTrash' : 'general:aboutToDelete', {
            label,
            title: title || String(id),
          })}
        />
      }
      confirmLabel={t('general:delete')}
      heading={t('general:confirmDeletion')}
      modalSlug={modalSlug}
      onConfirm={confirm}
    />
  );
}

/**
 * The panel's default header: the shared side panel bar, pinned to the top. The status slot
 * shows Unsaved and Save while a form without autosave has edits, else Mark complete for
 * `useAsDone` collections, else Saved for autosave. The ••• menu holds copy link, duplicate,
 * create new, the plugin `actions`, the saved time and delete. On the left, a back link when the
 * record was opened from inside the panel, the collection's name when nothing is behind it, and
 * the title once the body's title scrolls under the bar.
 */
export function RecordPanelHeader({ actions }: { actions?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleScrolledOut = useTitleScrolledOut(ref);
  const { i18n, t } = useTranslation();
  const { config, getEntityConfig } = useConfig();
  const { permissions } = useAuth();
  const panel = useRecordPanel();
  const { openModal } = useModal();
  const modified = useFormModified();
  const { submit } = useForm();
  const [completing, setCompleting] = useState<'idle' | 'pending' | 'saving'>('idle');
  const {
    collectionSlug = panel.collectionSlug,
    data,
    hasDeletePermission,
    hasSavePermission,
    id,
    lastUpdateTime,
  } = useDocumentInfo();

  const { title } = useDocumentTitle();
  const titlePath = usePanelLayout()?.titlePath;
  const collectionConfig = getEntityConfig({ collectionSlug });
  const useAsDone = getUseAsDone(collectionConfig);
  const autosave = Boolean(
    collectionConfig.versions &&
    typeof collectionConfig.versions.drafts === 'object' &&
    collectionConfig.versions.drafts.autosave,
  );

  const canCreate = Boolean(permissions?.collections?.[collectionSlug]?.create);
  const label = getTranslation(collectionConfig.labels.singular, i18n);
  const plural = getTranslation(collectionConfig.labels.plural, i18n);
  const isEditing = id !== undefined && id !== null && id !== '';

  useEffect(() => {
    if (completing !== 'pending') return;
    setCompleting('saving');
    void Promise.resolve(submit()).finally(() => setCompleting('idle'));
  }, [completing, submit]);

  const status =
    completing === 'idle'
      ? recordPanelStatus({
          autosave,
          canSave: Boolean(hasSavePermission),
          editing: isEditing,
          modified,
          useAsDone: Boolean(useAsDone),
        })
      : 'complete';

  const save = () => {
    ref.current
      ?.closest('form')
      ?.querySelector<HTMLButtonElement>('#action-save, #action-save-draft')
      ?.click();
  };

  const copyLink = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set('record', String(id));

    try {
      await navigator.clipboard.writeText(url.toString());
      toast.success(t('general:copied'));
    } catch {
      toast.error(t('error:unspecific'));
    }
  };

  const duplicate = async () => {
    const response = await fetch(
      formatAdminURL({
        apiRoute: config.routes.api,
        path: `/${collectionSlug}/${encodeURIComponent(String(id))}/duplicate?depth=1`,
      }),
      { credentials: 'include', headers: { 'Content-Type': 'application/json' }, method: 'POST' },
    );

    const result = (await response.json().catch(() => ({}))) as {
      doc?: { id: number | string };
      errors?: { message?: string }[];
    };

    if (!response.ok || !result.doc) {
      toast.error(result.errors?.[0]?.message ?? t('error:unspecific'));

      return;
    }

    toast.success(t('general:successfullyDuplicated', { label }));
    panel.notify({ doc: result.doc, operation: 'create', type: 'saved' });
    panel.switchTo(result.doc.id);
  };

  const savedTime =
    lastUpdateTime || (typeof data?.updatedAt === 'string' ? Date.parse(data.updatedAt) : NaN);

  const savedAt =
    isEditing && Number.isFinite(savedTime) && savedTime > 0
      ? new Date(savedTime).toLocaleTimeString(i18n.language, {
          hour: 'numeric',
          minute: '2-digit',
        })
      : undefined;

  const canDuplicate = isEditing && canCreate && !collectionConfig.disableDuplicate;
  const canDelete = isEditing && Boolean(hasDeletePermission);
  const hasActions = Array.isArray(actions) ? actions.length > 0 : Boolean(actions);
  const hasMenu = isEditing || canCreate || hasActions;

  const menu = hasMenu ? (
    <>
      {isEditing ? (
        <SidePanelMenuItem id="action-panel-copy-link" onSelect={() => void copyLink()}>
          Copy link
        </SidePanelMenuItem>
      ) : null}
      {canDuplicate ? (
        <SidePanelMenuItem
          id="action-panel-duplicate"
          onSelect={() => panel.guard(() => void duplicate())}
        >
          {t('general:duplicate')}
        </SidePanelMenuItem>
      ) : null}
      {canCreate ? (
        <SidePanelMenuItem id="action-panel-create" onSelect={() => panel.create()}>
          {t('general:createNew')}
        </SidePanelMenuItem>
      ) : null}
      {hasActions ? (
        <>
          {isEditing || canCreate ? <DropdownMenuSeparator /> : null}
          {actions}
        </>
      ) : null}
      {savedAt ? <SidePanelMenuNote>Saved {savedAt}</SidePanelMenuNote> : null}
      {canDelete ? (
        <>
          {savedAt ? null : <DropdownMenuSeparator />}
          <SidePanelMenuItem
            danger
            id="action-panel-delete"
            onSelect={() => openModal(deleteModalSlug(collectionSlug))}
          >
            {t('general:delete')}
          </SidePanelMenuItem>
        </>
      ) : null}
    </>
  ) : undefined;

  return (
    <div className={baseClass} ref={ref}>
      <SidePanelBar
        back={
          panel.parent
            ? { label: panel.parent.title || `#${panel.parent.id}`, onBack: panel.back }
            : undefined
        }
        context={panel.origin === 'link' ? plural : undefined}
        labels={{
          close: t('general:close'),
          expand: 'Open full page',
          more: t('general:moreOptions'),
        }}
        menu={menu}
        onClose={panel.close}
        onExpand={panel.expand}
        status={
          status === 'save' ? (
            <>
              {modified ? <span className={`${baseClass}__unsaved`}>Unsaved</span> : null}
              <Button
                buttonStyle="primary"
                className={`${baseClass}__save`}
                onClick={save}
                size="medium"
              >
                {t('general:save')}
              </Button>
            </>
          ) : status === 'complete' && useAsDone ? (
            <MarkComplete onToggle={() => setCompleting('pending')} path={useAsDone} />
          ) : status === 'saved' ? (
            <span className={`${baseClass}__saved`}>Saved</span>
          ) : undefined
        }
        title={title}
        titleInBody={Boolean(titlePath)}
        titleScrolledOut={titleScrolledOut}
      />
      {canDelete ? (
        <DeleteRecord
          onDeleted={() => {
            panel.notify({ id, type: 'deleted' });
            panel.reset();
          }}
        />
      ) : null}
    </div>
  );
}
