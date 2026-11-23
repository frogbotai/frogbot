'use client';

import { useAuth, useConfig, useRouter } from '@payloadcms/ui';
import { type RefObject, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { canUpdateField } from '../fieldPermissions.js';
import { rowRecordId } from '../panel/recordSteps.js';
import { DoneCheck } from '../records/DoneCheck.client.js';
import { getUseAsDone } from '../records/state.js';
import { useToggleDone } from '../records/useRecordState.js';

type Host = { element: HTMLElement; id: string };

const HOST = 'fb-list-done';

function findHosts(container: HTMLElement, titleCell: string): Host[] {
  const hosts: Host[] = [];

  container
    .querySelectorAll<HTMLElement>('.table:not(.table--drag-preview) tbody > tr')
    .forEach((row) => {
      const id = rowRecordId(row);
      const cell = row.querySelector<HTMLElement>(`:scope > td.${titleCell}`);
      if (!id || !cell) return;

      let element = cell.querySelector<HTMLElement>(`:scope > .${HOST}`);

      if (!element) {
        element = document.createElement('span');
        element.className = HOST;
        cell.prepend(element);
      }

      hosts.push({ element, id });
    });

  return hosts;
}

function sameHosts(a: Host[], b: Host[]): boolean {
  return a.length === b.length && a.every((host, i) => host.element === b[i].element);
}

/**
 * The check circle at the start of each row's title cell in a list whose collection sets
 * `admin.useAsDone`, as Asana's task list has. A click saves the done checkbox and reloads the
 * rows, or shows the saved state again when the save fails. Without update access to the
 * collection and its done field, the circle is read-only.
 */
export function ListDoneChecks({
  collectionSlug,
  containerRef,
  doneIds,
}: {
  collectionSlug: string;
  containerRef: RefObject<HTMLDivElement | null>;
  doneIds: string[];
}) {
  const { getEntityConfig } = useConfig();
  const { permissions } = useAuth();
  const router = useRouter();
  const collectionConfig = getEntityConfig({ collectionSlug });
  const useAsDone = getUseAsDone(collectionConfig);
  const titleCell = `cell-${(collectionConfig.admin.useAsTitle || 'id').replace(/\./g, '__')}`;
  const access = permissions?.collections?.[collectionSlug];
  const canUpdate = Boolean(
    access?.update && useAsDone && canUpdateField(access.fields, useAsDone),
  );

  const [hosts, setHosts] = useState<Host[]>([]);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const { saving, toggle } = useToggleDone({
    collectionSlug,
    onSaved: () => router.refresh(),
    useAsDone,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !useAsDone) return;

    const update = () =>
      setHosts((current) => {
        const next = findHosts(container, titleCell);

        return sameHosts(current, next) ? current : next;
      });

    update();
    const observer = new MutationObserver(update);
    observer.observe(container, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [containerRef, titleCell, useAsDone]);

  const key = doneIds.join('\n');

  useEffect(() => setPending({}), [key]);

  if (!useAsDone) return null;

  const done = new Set(doneIds);

  return hosts.map(({ element, id }) =>
    createPortal(
      <DoneCheck
        disabled={!canUpdate || saving}
        done={pending[id] ?? done.has(id)}
        onToggle={(next) => {
          setPending((current) => ({ ...current, [id]: next }));

          void toggle({ id }, next).then((saved) => {
            if (saved) return;
            setPending(({ [id]: _failed, ...rest }) => rest);
          });
        }}
      />,
      element,
      id,
    ),
  );
}
