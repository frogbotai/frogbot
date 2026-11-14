'use client';

import { SidePanelMenuItem } from '@frogbotai/ui';
import { useRecordPanel } from '@frogbotai/ui/admin';
import type { PanelComponentProps } from 'frogbot';
import { useEffect, useState } from 'react';

export function PanelAction({ close, expand, id }: PanelComponentProps) {
  return (
    <>
      <SidePanelMenuItem data-id={String(id)} data-testid="panel-action" onSelect={close}>
        Slot close
      </SidePanelMenuItem>
      <SidePanelMenuItem onSelect={expand}>Slot expand</SidePanelMenuItem>
    </>
  );
}

export function AfterFields({ collectionSlug }: PanelComponentProps) {
  return <p data-testid="panel-after">After {collectionSlug}</p>;
}

export function PanelFooter({ id }: PanelComponentProps) {
  return (
    <form
      data-id={String(id)}
      data-testid="panel-footer"
      onSubmit={(event) => {
        event.preventDefault();
        event.currentTarget.dataset.sent = 'true';
      }}
    >
      <input aria-label="Comment" placeholder="Add a comment" />
    </form>
  );
}

export function TextFooter() {
  return 'Journal entries save as you type';
}

export function EmptyFooter() {
  return null;
}

export function PanelHeader({ close, id }: PanelComponentProps) {
  return (
    <div data-testid="panel-header">
      Memo {String(id)}
      <button onClick={close} type="button">
        Header close
      </button>
    </div>
  );
}

export function PanelCloseButton() {
  const { close, expand } = useRecordPanel();

  return (
    <>
      <button onClick={close} type="button">
        Whole close
      </button>
      <button onClick={expand} type="button">
        Whole expand
      </button>
    </>
  );
}

export function Subtasks({ id }: PanelComponentProps) {
  const { open } = useRecordPanel();
  const [children, setChildren] = useState<Array<{ id: number; title: string }>>([]);

  useEffect(() => {
    if (!id) return;

    void fetch(`/api/todos?where[parent][equals]=${id}&depth=0`, { credentials: 'include' })
      .then((response) => response.json())
      .then((result: { docs: Array<{ id: number; title: string }> }) => setChildren(result.docs));
  }, [id]);

  if (!children.length) return null;

  return (
    <ul data-testid="subtasks" style={{ listStyle: 'none', margin: '0 0 24px', padding: 0 }}>
      {children.map((child) => (
        <li key={child.id}>
          <button onClick={() => open(child.id, { from: 'panel' })} type="button">
            {child.title}
          </button>
        </li>
      ))}
    </ul>
  );
}
