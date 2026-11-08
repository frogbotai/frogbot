'use client';

import { getTranslation } from '@payloadcms/translations';
import {
  Button,
  ConfirmationModal,
  Popup,
  PopupList,
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

import ArrowExpandIcon from '../../../icons/icons/ArrowExpandIcon.js';
import CheckmarkCircleIcon from '../../../icons/icons/CheckmarkCircleIcon.js';
import LinkSquareIcon from '../../../icons/icons/LinkSquareIcon.js';
import LogoutRightIcon from '../../../icons/icons/LogoutRightIcon.js';
import MoreVerticalIcon from '../../../icons/icons/MoreVerticalIcon.js';
import { getUseAsDone } from '../records/state.js';
import { useRecordPanel } from './RecordPanelProvider.client.js';

const baseClass = 'fb-record-panel-header';

const COMPACT_AFTER = 46;

function useCompact(ref: React.RefObject<HTMLElement | null>): boolean {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const body = ref.current?.closest('.fb-record-panel__body');
    if (!body) return;
    const update = () => setCompact(body.scrollTop > COMPACT_AFTER);

    update();
    body.addEventListener('scroll', update, { passive: true });

    return () => body.removeEventListener('scroll', update);
  }, [ref]);

  return compact;
}

function MarkComplete({ compact, path }: { compact: boolean; path: string }) {
  const { hasSavePermission } = useDocumentInfo();
  const { submit } = useForm();
  const { setValue, value } = useField<boolean>({ path });
  const [pending, setPending] = useState(false);
  const done = value === true;

  useEffect(() => {
    if (!pending) return;
    setPending(false);
    void submit();
  }, [pending, submit]);

  return (
    <button
      aria-label={done ? 'Completed' : 'Mark complete'}
      aria-pressed={done}
      className={[
        `${baseClass}__complete`,
        done && `${baseClass}__complete--done`,
        compact && `${baseClass}__complete--compact`,
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={!hasSavePermission}
      onClick={() => {
        setValue(!done);
        setPending(true);
      }}
      type="button"
    >
      <CheckmarkCircleIcon aria-hidden size={compact ? 18 : 16} />
      {compact ? null : <span>{done ? 'Completed' : 'Mark complete'}</span>}
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
 * The panel's default header. On the left, "Mark complete" for collections with `useAsDone`; once
 * the body scrolls, it shrinks to a check and the title and stays pinned. On the right, the
 * `actions` slot, Save (unless the collection autosaves), copy link, open full page, close, and a
 * menu with create new, duplicate, delete and the autosave status.
 */
export function RecordPanelHeader({ actions }: { actions?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const compact = useCompact(ref);
  const { i18n, t } = useTranslation();
  const { config, getEntityConfig } = useConfig();
  const { permissions } = useAuth();
  const panel = useRecordPanel();
  const { openModal } = useModal();
  const modified = useFormModified();
  const {
    collectionSlug = panel.collectionSlug,
    hasDeletePermission,
    hasSavePermission,
    id,
    lastUpdateTime,
  } = useDocumentInfo();

  const { title } = useDocumentTitle();
  const collectionConfig = getEntityConfig({ collectionSlug });
  const useAsDone = getUseAsDone(collectionConfig);
  const autosave = Boolean(
    collectionConfig.versions &&
    typeof collectionConfig.versions.drafts === 'object' &&
    collectionConfig.versions.drafts.autosave,
  );

  const canCreate = Boolean(permissions?.collections?.[collectionSlug]?.create);
  const label = getTranslation(collectionConfig.labels.singular, i18n);

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

  const isEditing = id !== undefined && id !== null && id !== '';
  const hasMenu =
    canCreate || (isEditing && (hasDeletePermission || canCreate)) || (autosave && isEditing);

  return (
    <div
      className={[baseClass, compact && `${baseClass}--compact`].filter(Boolean).join(' ')}
      ref={ref}
    >
      <div className={`${baseClass}__start`}>
        {useAsDone ? <MarkComplete compact={compact} path={useAsDone} /> : null}
        {compact ? <span className={`${baseClass}__title`}>{title}</span> : null}
      </div>
      <div className={`${baseClass}__actions`}>
        {actions}
        {!autosave && hasSavePermission ? (
          <Button
            buttonStyle={modified ? 'primary' : 'secondary'}
            className={`${baseClass}__save`}
            onClick={save}
            size="medium"
          >
            {t('general:save')}
          </Button>
        ) : null}
        {isEditing ? (
          <Button
            aria-label="Copy link"
            buttonStyle="ghost"
            className={`${baseClass}__icon`}
            icon={<LinkSquareIcon size={18} />}
            onClick={() => void copyLink()}
            tooltip="Copy link"
          />
        ) : null}
        {isEditing ? (
          <Button
            aria-label="Open full page"
            buttonStyle="ghost"
            className={`${baseClass}__icon`}
            icon={<ArrowExpandIcon size={18} />}
            onClick={panel.expand}
            tooltip="Open full page"
          />
        ) : null}
        <Button
          aria-label={t('general:close')}
          buttonStyle="ghost"
          className={`${baseClass}__icon`}
          icon={<LogoutRightIcon size={18} />}
          onClick={panel.close}
          tooltip={t('general:close')}
        />
        {hasMenu ? (
          <Popup
            button={<MoreVerticalIcon aria-label={t('general:moreOptions')} size={18} />}
            className={`${baseClass}__menu`}
            horizontalAlign="right"
            size="large"
            verticalAlign="bottom"
          >
            <PopupList.ButtonGroup>
              {canCreate ? (
                <PopupList.Button id="action-panel-create" onClick={() => panel.create()}>
                  {t('general:createNew')}
                </PopupList.Button>
              ) : null}
              {isEditing && canCreate && !collectionConfig.disableDuplicate ? (
                <PopupList.Button id="action-panel-duplicate" onClick={() => void duplicate()}>
                  {t('general:duplicate')}
                </PopupList.Button>
              ) : null}
              {isEditing && hasDeletePermission ? (
                <PopupList.Button
                  id="action-panel-delete"
                  onClick={() => openModal(deleteModalSlug(collectionSlug))}
                >
                  {t('general:delete')}
                </PopupList.Button>
              ) : null}
            </PopupList.ButtonGroup>
            {autosave && isEditing && lastUpdateTime ? (
              <div className={`${baseClass}__autosave`}>
                {t('version:autosavedSuccessfully')}{' '}
                {new Date(lastUpdateTime).toLocaleTimeString(i18n.language, {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </div>
            ) : null}
          </Popup>
        ) : null}
      </div>
      {isEditing && hasDeletePermission ? (
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
