'use client';

import { useState } from 'react';

import { DoneCheck } from '../../views/records/DoneCheck.client.js';
import { isRecordDone } from '../../views/records/state.js';
import { useToggleDone } from '../../views/records/useRecordState.js';

/** The check circle on a dashboard row, as in Asana's My tasks: one click marks the record done. */
export function RowDoneCheck({
  collectionSlug,
  disabled,
  done: initial,
  id,
  useAsDone,
}: {
  collectionSlug: string;
  disabled: boolean;
  done: boolean;
  id: number | string;
  useAsDone: string;
}) {
  const [done, setDone] = useState(initial);
  const { saving, toggle } = useToggleDone<Record<string, unknown> & { id: number | string }>({
    collectionSlug,
    onSaved: (doc) => setDone(isRecordDone(doc, useAsDone)),
    useAsDone,
  });

  return (
    <DoneCheck
      disabled={disabled || saving}
      done={done}
      onToggle={(next) => void toggle({ id }, next)}
    />
  );
}
