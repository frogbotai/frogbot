/** The one thing the record panel's status slot shows. */
export type RecordPanelStatus = 'complete' | 'save' | 'saved' | undefined;

export type RecordPanelStatusArgs = {
  autosave: boolean;
  canSave: boolean;
  editing: boolean;
  modified: boolean;
  useAsDone: boolean;
};

/**
 * Picks the status slot's content: Unsaved and Save while a form without autosave has edits or
 * is new, else Mark complete for a `useAsDone` collection, else Saved for an autosaved record.
 */
export function recordPanelStatus({
  autosave,
  canSave,
  editing,
  modified,
  useAsDone,
}: RecordPanelStatusArgs): RecordPanelStatus {
  if (canSave && !autosave && (modified || !editing)) return 'save';
  if (useAsDone && editing) return 'complete';
  if (autosave && editing) return 'saved';

  return undefined;
}
