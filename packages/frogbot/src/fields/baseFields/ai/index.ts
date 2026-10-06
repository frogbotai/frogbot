import type { ModelId } from '../../../ai/types.js';
import type { Field, Option, RowField, SelectField, TextField } from '../../config/types.js';
import { applyFieldKind, kindTypescriptSchema } from '../applyFieldKind.js';
import { rejectFieldOptions } from '../rejectFieldOptions.js';
import {
  aiFieldErrorHook,
  aiFieldQueueHook,
  aiFieldRunGuardHook,
  aiFieldStatusHook,
} from './hooks.js';
import { aiFieldPaths, type AIFieldStatus, type AIKind } from './state.js';

export type AIFieldArgs = Omit<
  Extract<TextField, { hasMany?: false | undefined }>,
  'type' | 'hasMany' | 'hidden' | 'minRows' | 'maxRows' | 'required' | 'virtual'
> & {
  inputs: string[];
  prompt: string;
  model?: ModelId;
  hasMany?: never;
  options?: never;
  required?: never;
};

export type AISelectFieldArgs = Omit<SelectField, 'type' | 'hidden' | 'required' | 'virtual'> & {
  inputs: string[];
  prompt: string;
  model?: ModelId;
  required?: never;
};

const statuses: AIFieldStatus[] = ['pending', 'done', 'error', 'manual'];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function optionValue(option: Option): unknown {
  return typeof option === 'string' ? option : option?.value;
}

function rejectBadOptions({ name, options }: { name: string; options: unknown }): void {
  if (!Array.isArray(options) || options.length === 0) {
    throw new Error(`aiField "${name}": options must be a non-empty array`);
  }

  if (!options.every((option: Option) => isNonEmptyString(optionValue(option)))) {
    throw new Error(`aiField "${name}": option values must be non-empty strings`);
  }
}

const REJECTED_OPTIONS = ['required', 'virtual', 'hidden'];

function toValueField(rest: Record<string, unknown>): SelectField | TextField {
  if (rest.options === undefined) return { ...rest, type: 'text' } as TextField;

  const { hasMany, ...select } = rest;

  return { ...select, type: 'select', ...(hasMany ? { hasMany: true } : {}) } as SelectField;
}

export function aiField(args: AIFieldArgs | AISelectFieldArgs): RowField {
  const { admin, inputs, model, prompt, ...rest } = args;
  const { position, ...valueAdmin } = admin ?? {};

  if (!Array.isArray(inputs) || inputs.length === 0 || !inputs.every(isNonEmptyString)) {
    throw new Error(`aiField "${args.name}": inputs must be a non-empty array of field names`);
  }

  if (!isNonEmptyString(prompt)) {
    throw new Error(`aiField "${args.name}": prompt must be a non-empty string`);
  }

  if (model !== undefined && !isNonEmptyString(model)) {
    throw new Error(`aiField "${args.name}": model must be a non-empty string`);
  }

  if (args.options === undefined) {
    rejectFieldOptions({ factory: 'aiField', field: args, keys: ['hasMany', ...REJECTED_OPTIONS] });
  } else {
    rejectFieldOptions({ factory: 'aiField', field: args, keys: REJECTED_OPTIONS });
    rejectBadOptions({ name: args.name, options: args.options });
  }

  const kind: AIKind = { type: 'ai', inputs, prompt, ...(model ? { model } : {}) };
  const paths = aiFieldPaths(args.name);
  const localized = rest.localized ? { localized: true } : {};

  const hooks = rest.hooks ?? {};

  const valueHooks = {
    ...hooks,
    beforeValidate: [
      ...(hooks.beforeValidate ?? []),
      aiFieldRunGuardHook({ name: args.name, path: args.name }),
    ],
  };

  const valueField = toValueField({
    ...rest,
    hooks: valueHooks,
    ...(admin ? { admin: valueAdmin } : {}),
  });

  const value = applyFieldKind(valueField, {
    kind,
    cell: true,
    Field: '@frogbotai/next/client#AIField',
    description: `Generated automatically by AI from: ${inputs.join(', ')}. Writing a value keeps it and stops automatic updates`,
  });

  const status: SelectField = {
    name: paths.status,
    type: 'select',
    options: statuses,
    admin: { disabled: true },
    ...localized,
    hooks: {
      beforeValidate: [aiFieldRunGuardHook({ name: args.name, path: paths.status })],
      beforeChange: [aiFieldStatusHook({ kind, name: args.name })],
      afterChange: [aiFieldQueueHook({ kind, name: args.name })],
      afterRead: [({ value }) => value ?? null],
    },
    typescriptSchema: [
      kindTypescriptSchema({
        text: 'Set by FrogBot: pending, done, error or manual. Write "pending" to regenerate the value',
      }),
    ],
  };

  const error: TextField = {
    name: paths.error,
    type: 'text',
    admin: { disabled: true },
    ...localized,
    hooks: {
      beforeValidate: [aiFieldRunGuardHook({ name: args.name, path: paths.error })],
      beforeChange: [aiFieldErrorHook({ kind, name: args.name })],
    },
    typescriptSchema: [
      kindTypescriptSchema({ text: 'Set by FrogBot: the error message from the last failed run' }),
    ],
  };

  return {
    type: 'row',
    ...(position ? { admin: { position } } : {}),
    fields: [value, status, error] as Field[],
  };
}
