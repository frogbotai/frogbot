'use client';

import { FieldLabel, useField } from '@frogbotai/ui';
import type { TextFieldClientComponent } from 'frogbot';
import { useId } from 'react';

export const NoteStatusField: TextFieldClientComponent = ({ field, path, readOnly }) => {
  const inputId = useId();
  const { setValue, value } = useField<string>({ path });

  return (
    <div>
      <FieldLabel
        htmlFor={inputId}
        label={field.label ?? 'Note status'}
        path={path}
        required={field.required}
      />
      <input
        id={inputId}
        name={path}
        onChange={(event) => setValue(event.target.value)}
        readOnly={readOnly}
        value={value ?? ''}
      />
    </div>
  );
};
