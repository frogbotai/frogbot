'use client';

import './CellEditor.css';

import {
  DocumentInfoProvider,
  Form,
  type FormProps,
  OperationProvider,
  RenderFields,
  useAuth,
  useConfig,
  useForm,
  useFormModified,
  useLocale,
  useServerFunctions,
} from '@payloadcms/ui';
import type {
  ClientField,
  Data,
  FormState,
  SanitizedCollectionPermission,
  SanitizedFieldPermissions,
} from 'payload';
import { formatAdminURL, reduceFieldsToValues } from 'payload/shared';
import * as qs from 'qs-esm';
import {
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { withValuesAt } from './fieldPath.js';

/** How an edit ended: cancelled, saved, or saved and moving to the next or previous cell. */
export type CellEditorDone = 'cancel' | 'next' | 'prev' | 'saved';

/** Lets the list save the open cell before something else takes over, such as another click. */
export type CellEditorHandle = { commit: () => Promise<boolean> };

export type CellEditorProps = {
  collectionSlug: string;
  field: ClientField;
  /** Filled with the editor's `commit` while it is open. */
  handleRef: RefObject<CellEditorHandle | null>;
  id: string;
  /** A printable key that started the edit; it replaces the value in a text input. */
  initialText?: string;
  /** Enter or Tab pressed before the editor was ready: it saves as soon as the value is in. */
  pendingDone?: Exclude<CellEditorDone, 'cancel'>;
  /** Select-all pressed before the editor was ready: the text input opens with its value selected. */
  selectAll?: boolean;
  onDone: (done: CellEditorDone) => void;
  /** Called after a save, before `onDone`. */
  onSaved: () => void;
  parentPath: string;
  path: string;
  permissions: SanitizedCollectionPermission | undefined;
};

const baseClass = 'fb-cell-editor';

const FOCUSABLE =
  'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';

const DATE_PICKER = '.react-datepicker__input-container';

const OPEN_MENUS = '.rs__menu, .react-datepicker-popper, .popup__content';

const TEXT_INPUT =
  'input:is([type="text"], [type="search"], [type="tel"], [type="url"], [type="email"], [type="number"]), input:not([type]), textarea';

function cellPaths(field: ClientField, path: string): string[] {
  return field.type === 'date' && field.timezone ? [path, `${path}_tz`] : [path];
}

function pickPaths(state: FormState, paths: string[]): FormState {
  return Object.fromEntries(
    Object.entries(state).filter(([key]) =>
      paths.some((path) => key === path || key.startsWith(`${path}.`)),
    ),
  );
}

function fieldPermissionsAt(
  permissions: SanitizedCollectionPermission | undefined,
  parentPath: string,
): SanitizedFieldPermissions | Record<string, SanitizedFieldPermissions> {
  let fields: SanitizedCollectionPermission['fields'] | true | undefined = permissions?.fields;

  for (const name of parentPath ? parentPath.split('.') : []) {
    if (fields === true || fields === undefined) break;
    const step = fields[name];

    fields = step === true ? true : step?.fields;
  }

  return fields ?? true;
}

function typeInto(input: HTMLInputElement | HTMLTextAreaElement, text: string) {
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;

  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function CellEditorFields({
  action,
  drafts,
  field,
  handleRef,
  initialText,
  onDone,
  parentPath,
  pendingDone,
  permissions,
  savedRef,
  selectAll,
}: Pick<
  CellEditorProps,
  'field' | 'handleRef' | 'initialText' | 'onDone' | 'parentPath' | 'pendingDone' | 'selectAll'
> & {
  action: string;
  drafts: boolean;
  permissions: SanitizedFieldPermissions | Record<string, SanitizedFieldPermissions>;
  savedRef: RefObject<boolean>;
}) {
  const { submit } = useForm();
  const modified = useFormModified();
  const rootRef = useRef<HTMLDivElement>(null);
  const selectAllRef = useRef(selectAll);
  const pendingRef = useRef<Promise<boolean> | null>(null);
  const modifiedRef = useRef(modified);

  useEffect(() => {
    modifiedRef.current = modified;
    selectAllRef.current = selectAll;
  }, [modified, selectAll]);

  const commit = useCallback(() => {
    if (pendingRef.current) return pendingRef.current;
    if (!modifiedRef.current) return Promise.resolve(true);

    savedRef.current = false;

    pendingRef.current = submit({
      action,
      method: 'PATCH',
      ...(drafts ? { overrides: { _status: 'draft' } } : {}),
    })
      .then(() => savedRef.current)
      .finally(() => {
        pendingRef.current = null;
      });

    return pendingRef.current;
  }, [action, drafts, savedRef, submit]);

  useEffect(() => {
    handleRef.current = { commit };

    return () => {
      if (handleRef.current?.commit === commit) handleRef.current = null;
    };
  }, [commit, handleRef]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const cell = root?.closest('td');

    if (!root || !cell) return;
    cell.toggleAttribute('data-cell-editing', true);

    const focusField = () => {
      const target = root.querySelector<HTMLElement>(FOCUSABLE);

      if (!target) return false;
      target.focus();

      if (initialText && target.matches(TEXT_INPUT)) {
        typeInto(target as HTMLInputElement | HTMLTextAreaElement, initialText);
      } else if (selectAllRef.current && target.matches(TEXT_INPUT)) {
        (target as HTMLInputElement | HTMLTextAreaElement).select();
      } else if (target.closest('.rs__control')) {
        target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
      }

      return true;
    };

    const observer = new MutationObserver(() => {
      if (focusField()) observer.disconnect();
    });

    if (!focusField()) {
      observer.observe(root, { attributes: true, childList: true, subtree: true });
    }

    return () => {
      observer.disconnect();
      cell.removeAttribute('data-cell-editing');
    };
  }, [initialText]);

  const finish = useCallback(
    (done: CellEditorDone) => {
      void commit().then((saved) => {
        if (saved) onDone(done);
      });
    },
    [commit, onDone],
  );

  const queuedRef = useRef(pendingDone);

  useEffect(() => {
    if (pendingDone) queuedRef.current = pendingDone;
  }, [pendingDone]);

  useEffect(() => {
    const done = queuedRef.current;

    if (!done || (initialText && !modified)) return;
    queuedRef.current = undefined;
    finish(done);
  }, [finish, initialText, modified, pendingDone]);

  const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    const inPicker = (event.target as HTMLElement).closest(DATE_PICKER);

    if (event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      finish(event.shiftKey ? 'prev' : 'next');

      return;
    }

    if (event.key === 'Escape' && !document.querySelector(OPEN_MENUS)) {
      event.preventDefault();
      event.stopPropagation();
      onDone('cancel');

      return;
    }

    if (event.key !== 'Enter' || event.shiftKey || !inPicker) return;
    window.setTimeout(() => finish('saved'), 0);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.nativeEvent.isComposing) return;
    if (event.key === 'Enter' && (event.target as HTMLElement).closest(DATE_PICKER)) return;

    const inTextarea = (event.target as HTMLElement).matches('textarea');

    if (event.key === 'Enter' && !(inTextarea && event.shiftKey)) {
      event.preventDefault();
      finish('saved');
    }
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Keys bubble up from the field's own inputs, so their menus handle Enter and Esc first.
    <div
      className={`${baseClass}__fields`}
      onKeyDown={onKeyDown}
      onKeyDownCapture={onKeyDownCapture}
      ref={rootRef}
      role="group"
    >
      <RenderFields
        fields={[field]}
        forceRender
        parentIndexPath=""
        parentPath={parentPath}
        parentSchemaPath={parentPath}
        permissions={permissions}
      />
    </div>
  );
}

/**
 * Edits one field of one record where it is shown, with the field's own `Field` component: a
 * Payload form for that field alone, built the way bulk edit builds its form, saved with one
 * `PATCH` so validation, hooks and access run as on the edit page. Drafts save as drafts.
 */
export function CellEditor({
  collectionSlug,
  field,
  handleRef,
  id,
  initialText,
  onDone,
  onSaved,
  pendingDone,
  parentPath,
  path,
  permissions,
  selectAll,
}: CellEditorProps) {
  const { config, getEntityConfig } = useConfig();
  const { user } = useAuth();
  const locale = useLocale();
  const { getFormState } = useServerFunctions();
  const [loaded, setLoaded] = useState<{ data: Data; state: FormState }>();
  const savedRef = useRef(false);
  const loadedRef = useRef<Data>({});
  const drafts = Boolean(getEntityConfig({ collectionSlug })?.versions?.drafts);
  const pathsKey = cellPaths(field, path).join('\n');
  const apiRoute = config.routes.api;

  const query = qs.stringify(
    { depth: 0, locale: locale?.code, ...(drafts ? { draft: true } : {}) },
    { addQueryPrefix: true },
  );

  const action = formatAdminURL({
    apiRoute,
    path: `/${collectionSlug}/${encodeURIComponent(id)}${query}`,
  });

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch(action, { credentials: 'include', signal: controller.signal });
        if (!response.ok) throw new Error(response.statusText);

        const data = (await response.json()) as Data;

        loadedRef.current = data;
        const { state } = await getFormState({
          collectionSlug,
          data,
          docPermissions: permissions,
          docPreferences: { fields: {} },
          id,
          operation: 'update',
          renderAllFields: true,
          schemaPath: collectionSlug,
          signal: controller.signal,
          skipValidation: true,
        });

        if (!controller.signal.aborted && state) {
          setLoaded({ data, state: pickPaths(state, pathsKey.split('\n')) });
        }
      } catch {
        if (!controller.signal.aborted) onDone('cancel');
      }
    })();

    return () => controller.abort();
  }, [action, collectionSlug, getFormState, id, onDone, pathsKey, permissions]);

  const onChange = useCallback<NonNullable<FormProps['onChange']>[number]>(
    async ({ formState, submitted }) => {
      const { state } = await getFormState({
        collectionSlug,
        data: withValuesAt(
          loadedRef.current,
          reduceFieldsToValues(formState, true),
          pathsKey.split('\n'),
        ),
        docPermissions: permissions,
        docPreferences: { fields: {} },
        formState,
        id,
        operation: 'update',
        schemaPath: collectionSlug,
        skipValidation: !submitted,
      });

      return state ? pickPaths(state, pathsKey.split('\n')) : formState;
    },
    [collectionSlug, getFormState, id, pathsKey, permissions],
  );

  const onSuccess = useCallback(() => {
    savedRef.current = true;
    onSaved();
  }, [onSaved]);

  if (!loaded) return null;

  return (
    <DocumentInfoProvider
      collectionSlug={collectionSlug}
      currentEditor={user!}
      docPermissions={permissions}
      hasPublishedDoc={false}
      id={id}
      initialData={loaded.data}
      isLocked={false}
      lastUpdateTime={0}
      mostRecentVersionIsAutosaved={false}
      unpublishedVersionCount={0}
      versionCount={0}
    >
      <OperationProvider operation="update">
        <Form
          className={baseClass}
          disableSuccessStatus
          initialState={loaded.state}
          onChange={[onChange]}
          onSuccess={onSuccess}
        >
          <CellEditorFields
            action={action}
            drafts={drafts}
            field={field}
            handleRef={handleRef}
            initialText={initialText}
            pendingDone={pendingDone}
            onDone={onDone}
            parentPath={parentPath}
            permissions={fieldPermissionsAt(permissions, parentPath)}
            savedRef={savedRef}
            selectAll={selectAll}
          />
        </Form>
      </OperationProvider>
    </DocumentInfoProvider>
  );
}
