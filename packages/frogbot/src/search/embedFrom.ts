import { isDeepStrictEqual } from 'node:util';

import { ValidationError } from 'payload';

import type { ModelId } from '../ai/types.js';
import type { FieldHookArgs } from '../fields/config/types.js';

type Doc = Record<string, unknown>;

export type EmbedFromOptions = { model: ModelId } & (
  | { fields: string[]; text?: never }
  | { fields?: never; text: (doc: Doc) => string | null | undefined }
);

export type EmbedFromHook = (args: FieldHookArgs) => Promise<number[] | null | undefined>;

const registry = new WeakMap<object, EmbedFromOptions>();

export function getEmbedFromOptions(hook: unknown): EmbedFromOptions | undefined {
  return typeof hook === 'function' ? registry.get(hook) : undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function checkOptions(options: EmbedFromOptions): void {
  if (typeof options !== 'object' || options === null) {
    throw new Error('[frogbot] embedFrom: options must be an object');
  }

  if (!isNonEmptyString(options.model)) {
    throw new Error('[frogbot] embedFrom: model must be a non-empty string');
  }

  if ((options.fields === undefined) === (options.text === undefined)) {
    throw new Error('[frogbot] embedFrom: set exactly one of `fields` or `text`');
  }

  if (
    options.fields !== undefined &&
    (!Array.isArray(options.fields) ||
      options.fields.length === 0 ||
      !options.fields.every(isNonEmptyString))
  ) {
    throw new Error('[frogbot] embedFrom: fields must be a non-empty array of field names');
  }

  if (options.text !== undefined && typeof options.text !== 'function') {
    throw new Error('[frogbot] embedFrom: text must be a function');
  }
}

function buildText(options: EmbedFromOptions, doc: Doc): string | undefined {
  const raw = options.fields
    ? options.fields
        .map((name) => doc[name])
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => value !== '')
        .join('\n\n')
    : options.text(doc);

  const text = typeof raw === 'string' ? raw.trim() : '';

  return text === '' ? undefined : text;
}

function siblingAt(doc: unknown, path: (number | string)[]): Doc | undefined {
  let current = doc;

  for (const segment of path) {
    if (typeof current !== 'object' || current === null) return undefined;

    current = (current as Doc)[segment];
  }

  return typeof current === 'object' && current !== null ? (current as Doc) : undefined;
}

async function publishedSibling({
  collection,
  id,
  path,
  req,
}: {
  collection: string;
  id: number | string;
  path: (number | string)[];
  req: FieldHookArgs['req'];
}): Promise<Doc | undefined> {
  const published = (await req.frogbot.findByID({
    collection,
    id,
    depth: 0,
    disableErrors: true,
    draft: false,
    fallbackLocale: 'none',
    locale: req.locale ?? undefined,
    overrideAccess: true,
    req: { ...req, query: { ...req.query } },
  })) as Doc | null;

  if (published?._status !== 'published') return undefined;

  return siblingAt(published, path.slice(0, -1));
}

/**
 * A vector field `beforeChange` hook that fills the field from sibling text
 * with `frogbot.embed`, and only calls the model when that text changes.
 */
export function embedFrom(options: EmbedFromOptions): EmbedFromHook {
  checkOptions(options);

  const hook: EmbedFromHook = async ({
    collection,
    data,
    operation,
    originalDoc,
    overrideAccess,
    path,
    previousSiblingDoc,
    previousValue,
    req,
    siblingData,
    value,
  }) => {
    if (data?._status === 'draft') return undefined;

    if (req.locale === 'all') {
      throw new ValidationError({
        ...(collection ? { collection: collection.slug } : {}),
        errors: [
          {
            message: `embedFrom can't embed a locale 'all' write to "${path.join('.')}". Save one locale at a time.`,
            path: path.join('.'),
          },
        ],
      });
    }

    if (value !== undefined && !isDeepStrictEqual(value ?? null, previousValue ?? null)) {
      return undefined;
    }

    let previous: Doc | undefined = operation === 'create' ? undefined : previousSiblingDoc;

    if (
      previous &&
      collection &&
      data?._status === 'published' &&
      originalDoc?._status === 'draft' &&
      originalDoc.id !== undefined
    ) {
      previous = await publishedSibling({
        collection: collection.slug,
        id: originalDoc.id as number | string,
        path,
        req,
      });
    }

    const text = buildText(options, { ...previousSiblingDoc, ...siblingData });

    if (text === undefined) return null;

    const stored = previous?.[String(path.at(-1))];

    if (previous && stored != null && buildText(options, previous) === text) return undefined;

    const { embedding } = await req.frogbot.embed({
      model: options.model,
      value: text,
      req,
      overrideAccess,
    });

    return embedding;
  };

  registry.set(hook, options);

  return hook;
}
