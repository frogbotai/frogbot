import type { Data } from 'payload';

import type { PanelSettings } from './config.js';

/** A save or delete the panel made, so views can update the record behind it. */
export type RecordPanelEvent =
  | { doc: Data & { id: number | string }; operation: 'create' | 'update'; type: 'saved' }
  | { id: number | string; type: 'deleted' };

/** What the form inside the panel reports: unsaved edits to guard, and the title for a back link. */
export type RecordPanelForm = { modified: boolean; title?: string };

/** A record the panel was drilled into from, which its back link returns to. */
export type RecordPanelParent = { collection: string; id: string; title: string };

/** Options for `open`: a click's modifier keys, and `from: 'panel'` when a record opens from inside the panel. */
export type RecordPanelOpenOptions = Partial<
  Pick<MouseEvent, 'button' | 'ctrlKey' | 'metaKey' | 'shiftKey'>
> & { from?: 'panel' };

/** Options for `create`: `from: 'panel'` when the record is created from inside the panel. */
export type RecordPanelCreateOptions = { from?: 'panel' };

export type RecordPanelState =
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
  /**
   * Opens a create form in the panel; the first save switches it to the new record. With
   * `from: 'panel'` the open record becomes the parent its back link returns to, as with `open`.
   */
  create: (initialData?: Data, options?: RecordPanelCreateOptions) => void;
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
