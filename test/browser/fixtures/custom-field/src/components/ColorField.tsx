'use client';

import { FieldLabel, useField } from '@frogbotai/ui/admin';
import type { TextFieldClientProps } from 'frogbot';

export const ColorField = ({ field, path }: TextFieldClientProps) => {
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
