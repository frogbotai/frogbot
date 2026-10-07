import type { PayloadRequest } from 'payload';

import { attachRegisteredFrogBot } from '../../config/attachFrogBot.js';
import { toPayloadRequest } from '../../seams/request.js';
import type { Block, Field } from './types.js';

type RequestArgs = { req?: PayloadRequest } | undefined;

type RequestFunction = (args: RequestArgs) => unknown;

type ValidateFunction = (value: unknown, options: RequestArgs) => unknown;

type AccessOperation = 'create' | 'read' | 'update';

type FieldSlots = {
  access?: Partial<Record<AccessOperation, unknown>>;
  blockReferences?: (Block | string)[];
  blocks?: Block[];
  defaultValue?: unknown;
  fields?: Field[];
  filterOptions?: unknown;
  tabs?: FieldSlots[];
  type?: string;
  validate?: unknown;
};

const accessOperations: AccessOperation[] = ['create', 'read', 'update'];

const wrappedFunctions = new WeakSet<object>();

function attachRequest(args: RequestArgs): RequestArgs {
  if (!args?.req?.payload) return args;

  return { ...args, req: toPayloadRequest(attachRegisteredFrogBot(args.req)) };
}

function wrapRequestFunction(fn: unknown): unknown {
  if (typeof fn !== 'function' || wrappedFunctions.has(fn)) return fn;

  const wrapped: RequestFunction = (args) => (fn as RequestFunction)(attachRequest(args));

  wrappedFunctions.add(wrapped);

  return wrapped;
}

function wrapValidate(validate: unknown): unknown {
  if (typeof validate !== 'function' || wrappedFunctions.has(validate)) return validate;

  const wrapped: ValidateFunction = (value, options) =>
    (validate as ValidateFunction)(value, attachRequest(options));

  wrappedFunctions.add(wrapped);

  return wrapped;
}

function wrapAccess(access: FieldSlots['access']): FieldSlots['access'] {
  if (!access) return access;

  const wrapped = { ...access };

  for (const operation of accessOperations) {
    if (typeof access[operation] === 'function') {
      wrapped[operation] = wrapRequestFunction(access[operation]);
    }
  }

  return wrapped;
}

function wrapBlock<T extends Block>(block: T): T {
  return { ...block, fields: wrapFieldRequestFunctions(block.fields) };
}

function wrapField<T extends FieldSlots>(field: T): T {
  const patch: FieldSlots = {};

  if (typeof field.defaultValue === 'function') {
    patch.defaultValue = wrapRequestFunction(field.defaultValue);
  }

  if (typeof field.filterOptions === 'function') {
    patch.filterOptions = wrapRequestFunction(field.filterOptions);
  }

  if (typeof field.validate === 'function') patch.validate = wrapValidate(field.validate);

  if (field.access && typeof field.access === 'object') patch.access = wrapAccess(field.access);

  if (Array.isArray(field.fields)) patch.fields = wrapFieldRequestFunctions(field.fields);

  if (field.type === 'tabs' && Array.isArray(field.tabs)) patch.tabs = field.tabs.map(wrapField);

  if (field.type === 'blocks' && Array.isArray(field.blocks)) {
    patch.blocks = field.blocks.map(wrapBlock);
  }

  if (field.type === 'blocks' && field.blockReferences) {
    patch.blockReferences = field.blockReferences.map((block) =>
      typeof block === 'string' ? block : wrapBlock(block),
    );
  }

  if (Object.keys(patch).length === 0) return field;

  return { ...field, ...patch };
}

export function wrapFieldRequestFunctions<T extends Field>(fields: T[]): T[] {
  return fields.map((field) => wrapField(field));
}
