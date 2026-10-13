'use client';

import { useForm, useFormFields } from '@payloadcms/ui';
import type { NumberFieldClientProps, NumberFieldValidation, Validate } from 'payload';
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';

export type ParsedInputValue = number | null | undefined;

export type UseParsedInputArgs = {
  format: (value: unknown) => string;
  parse: (text: string) => ParsedInputValue;
  path: string;
  setValue: (value: unknown, disableModifyingForm?: boolean) => void;
  validate: Validate;
  value: unknown;
};

export type ParsedInput = {
  held: boolean;
  heldShown: boolean;
  onBlur: () => void;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  text: string;
};

export type ParsedInputValidateArgs = {
  max?: number;
  message: string;
  min?: number;
  required?: boolean;
  validate?: NumberFieldClientProps['validate'];
};

export function parsedInputValidate({
  max,
  message,
  min,
  required,
  validate,
}: ParsedInputValidateArgs): Validate {
  return (value, options) => {
    if (typeof value === 'string') return message;

    if (typeof validate !== 'function') return true;

    return validate(
      value as number,
      {
        ...options,
        max,
        min,
        required,
      } as Parameters<NumberFieldValidation>[1],
    );
  };
}

export function useParsedInput({
  format,
  parse,
  path,
  setValue,
  validate,
  value,
}: UseParsedInputArgs): ParsedInput {
  const dispatchField = useFormFields(([, dispatch]) => dispatch);
  const { setModified } = useForm();

  const [text, setText] = useState(() => format(value));
  const [heldShown, setHeldShown] = useState(false);
  const written = useRef<unknown>(value);

  useEffect(() => {
    if (value === written.current) return;

    const wasHeld = typeof written.current === 'string';

    written.current = value;
    setText(format(value));
    setHeldShown(false);

    if (wasHeld) setValue(value, true);
  }, [format, setValue, value]);

  const onChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value;
      const parsed = parse(next);

      setText(next);

      if (parsed === undefined) {
        written.current = next;

        dispatchField({ type: 'UPDATE', disableFormData: true, path, validate, value: next });
        setModified(true);

        return;
      }

      written.current = parsed;
      setHeldShown(false);
      setValue(parsed);
    },
    [dispatchField, parse, path, setModified, setValue, validate],
  );

  const onBlur = useCallback(() => {
    const parsed = parse(text);

    if (parsed === undefined) {
      setHeldShown(true);

      return;
    }

    setText(format(parsed));
  }, [format, parse, text]);

  const held = parse(text) === undefined;

  return { held, heldShown: held && heldShown, onBlur, onChange, text };
}
