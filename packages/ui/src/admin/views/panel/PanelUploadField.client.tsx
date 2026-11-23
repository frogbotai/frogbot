'use client';

import { getTranslation } from '@payloadcms/translations';
import {
  toast,
  useAuth,
  useConfig,
  useDocumentInfo,
  useField,
  useForm,
  useTranslation,
  withCondition,
} from '@payloadcms/ui';
import type { SanitizedFieldsPermissions, UploadFieldClient } from 'payload';
import { formatAdminURL } from 'payload/shared';
import * as qs from 'qs-esm';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';

import FileIcon from '../../../icons/icons/FileIcon.js';
import XIcon from '../../../icons/icons/XIcon.js';
import { PanelIconButton } from '../../elements/PanelIconButton/index.client.js';
import { PanelSection } from '../../elements/PanelSection/index.client.js';
import { findPanelField } from './config.js';
import { usePanelLayout } from './PanelConfig.client.js';

type Id = number | string;

type FileDoc = {
  filename?: null | string;
  id: Id;
  mimeType?: null | string;
  thumbnailURL?: null | string;
  url?: null | string;
};

function toId(value: unknown): Id | undefined {
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'id' in value) return value.id as Id;

  return undefined;
}

function toIds(value: unknown): Id[] {
  return (Array.isArray(value) ? value : [value]).flatMap((item) => {
    const id = toId(item);

    return id === undefined ? [] : [id];
  });
}

function canUpdateField(fields: SanitizedFieldsPermissions | undefined, path: string): boolean {
  let current = fields;

  for (const name of path.split('.')) {
    if (current === undefined || current === true) return true;
    const field = current[name];

    if (field === undefined || field === true) return true;
    if (!field.update) return false;
    current = field.fields;
  }

  return true;
}

function PanelUploadFieldComponent({ path }: { path: string }) {
  const { config, getEntityConfig } = useConfig();
  const { permissions } = useAuth();
  const { i18n } = useTranslation();
  const { docPermissions, hasSavePermission, id, isTrashed } = useDocumentInfo();
  const { submit } = useForm();
  const layout = usePanelLayout();
  const { setValue, value } = useField<unknown>({ path });
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Record<string, FileDoc>>({});
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState(false);
  const requested = useRef(new Set<string>());
  const latestIds = useRef<Id[]>([]);

  const field = layout
    ? (findPanelField(layout.collectionConfig.fields, path)?.field as UploadFieldClient | undefined)
    : undefined;

  const relationTo = typeof field?.relationTo === 'string' ? field.relationTo : undefined;
  const hasMany = Boolean(field?.hasMany);
  const ids = toIds(value);
  const key = ids.join(',');
  const api = config.routes.api;

  useEffect(() => {
    latestIds.current = ids;
  });

  useEffect(() => {
    const missing = key ? key.split(',').filter((item) => !requested.current.has(item)) : [];

    if (!relationTo || !missing.length) return;

    for (const item of missing) requested.current.add(item);

    const query = qs.stringify(
      { depth: 0, limit: missing.length, where: { id: { in: missing } } },
      { addQueryPrefix: true },
    );

    void fetch(formatAdminURL({ apiRoute: api, path: `/${relationTo}${query}` }), {
      credentials: 'include',
    })
      .then((response) => (response.ok ? response.json() : undefined))
      .then((result?: { docs: FileDoc[] }) => {
        if (!result?.docs.length) return;

        setFiles((known) => ({
          ...known,
          ...Object.fromEntries(result.docs.map((doc) => [String(doc.id), doc])),
        }));
      })
      .catch(() => undefined);
  }, [api, key, relationTo]);

  useEffect(() => {
    if (!pending) return;

    setPending(false);
    void submit({ disableSuccessStatus: true });
  }, [key, pending, submit]);

  if (!field || !relationTo) return null;

  const readOnly =
    Boolean(field.admin?.readOnly) ||
    !hasSavePermission ||
    Boolean(isTrashed) ||
    !canUpdateField(docPermissions?.fields, path);

  const full = hasMany && typeof field.maxRows === 'number' && ids.length >= field.maxRows;
  const canCreate =
    !readOnly &&
    !full &&
    field.admin?.allowCreate !== false &&
    Boolean(permissions?.collections?.[relationTo]?.create);

  const saved = id !== undefined && id !== null;

  const save = (next: Id[]) => {
    setValue(hasMany ? next : (next[0] ?? null));
    if (saved) setPending(true);
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = [...(event.target.files ?? [])];

    event.target.value = '';
    if (!picked.length) return;

    setUploading(true);

    try {
      const added = await Promise.all(
        picked.map(async (file) => {
          const body = new FormData();

          body.append('file', file);

          const response = await fetch(formatAdminURL({ apiRoute: api, path: `/${relationTo}` }), {
            body,
            credentials: 'include',
            method: 'POST',
          });

          if (!response.ok) throw new Error(file.name);

          return ((await response.json()) as { doc: FileDoc }).doc;
        }),
      );

      for (const doc of added) requested.current.add(String(doc.id));

      setFiles((known) => ({
        ...known,
        ...Object.fromEntries(added.map((doc) => [String(doc.id), doc])),
      }));

      save(hasMany ? [...latestIds.current, ...added.map((doc) => doc.id)] : [added[0].id]);
    } catch (error) {
      toast.error(`Could not upload ${error instanceof Error ? error.message : 'the file'}`);
    } finally {
      setUploading(false);
    }
  };

  const heading = field.label ? getTranslation(field.label, i18n) : field.name;
  const labels = getEntityConfig({ collectionSlug: relationTo })?.labels;
  const singular = labels?.singular ? getTranslation(labels.singular, i18n) : 'file';

  return (
    <PanelSection
      addLabel={`Add ${singular.toLowerCase()}`}
      className="fb-panel-upload"
      heading={heading}
      onAdd={canCreate && !uploading ? () => input.current?.click() : undefined}
    >
      {canCreate ? (
        <input
          hidden
          multiple={hasMany}
          onChange={(event) => void upload(event)}
          ref={input}
          type="file"
        />
      ) : null}
      {ids.length ? (
        <ul className="fb-panel-upload__files">
          {ids.map((fileId) => {
            const file = files[String(fileId)];
            const name = file?.filename ?? `#${fileId}`;
            const thumbnail = file?.mimeType?.startsWith('image/')
              ? (file.thumbnailURL ?? file.url)
              : undefined;

            return (
              <li className="fb-panel-upload__file" key={fileId}>
                <span aria-hidden className="fb-panel-upload__icon">
                  {thumbnail ? <img alt="" src={thumbnail} /> : <FileIcon size={16} />}
                </span>
                {file?.url ? (
                  <a
                    className="fb-panel-upload__name"
                    href={file.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {name}
                  </a>
                ) : (
                  <span className="fb-panel-upload__name">{name}</span>
                )}
                {readOnly ? null : (
                  <PanelIconButton
                    className="fb-panel-upload__remove"
                    icon={<XIcon size={16} />}
                    label={`Remove ${name}`}
                    onClick={() => save(ids.filter((item) => item !== fileId))}
                  />
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </PanelSection>
  );
}

/**
 * An upload field in the record panel, as Asana shows attachments: the field's label with `+`,
 * which picks files and uploads them, then a row per file that opens it in a new tab or removes
 * it. On a saved record each change saves at once. The edit page and drawers keep Payload's
 * upload field.
 */
export const PanelUploadField = withCondition(PanelUploadFieldComponent);
