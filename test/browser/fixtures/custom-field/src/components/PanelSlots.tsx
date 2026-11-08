'use client';

import { useRecordPanel } from '@frogbotai/ui/admin';
import type { PanelComponentProps } from 'frogbot';

export function PanelAction({ close, expand, id }: PanelComponentProps) {
  return (
    <span data-testid="panel-action" data-id={String(id)}>
      <button onClick={close} type="button">
        Slot close
      </button>
      <button onClick={expand} type="button">
        Slot expand
      </button>
    </span>
  );
}

export function AfterFields({ collectionSlug }: PanelComponentProps) {
  return <p data-testid="panel-after">After {collectionSlug}</p>;
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
