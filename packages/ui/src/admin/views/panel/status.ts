/** The one thing the record panel's status slot shows. */
export type RecordPanelStatus = 'save' | 'saved' | undefined;

export type RecordPanelStatusArgs = {
  autosave: boolean;
  canSave: boolean;
  editing: boolean;
  modified: boolean;
};

/**
 * Picks the status slot's content: Unsaved and Save while a form without autosave has edits or
 * is new, else Saved for an autosaved record. Mark complete is not a status: it leads the bar.
 */
export function recordPanelStatus({
  autosave,
  canSave,
  editing,
  modified,
}: RecordPanelStatusArgs): RecordPanelStatus {
  if (canSave && !autosave && (modified || !editing)) return 'save';
  if (autosave && editing) return 'saved';

  return undefined;
}
