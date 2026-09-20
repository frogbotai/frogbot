'use client';

import { FieldLabel, useField } from '@frogbotai/ui';
import type { TextFieldClientComponent } from 'frogbot';

export const ColorField: TextFieldClientComponent = ({ field, path }) => {
  const { setValue, showError, value } = useField<string>({ path });

  return (
    <div className="field-type text">
      <FieldLabel label={field.label} path={path} required={field.required} />
      <input
        aria-invalid={showError}
        id={`field-${path}`}
        name={path}
        onChange={(event) => setValue(event.target.value)}
        type="text"
        value={value ?? ''}
      />
    </div>
  );
};
