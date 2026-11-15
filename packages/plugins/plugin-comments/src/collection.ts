import { mentionedIds } from '@frogbotai/richtext-lexical';
import {
  APIError,
  type CollectionAfterReadHook,
  type CollectionBeforeChangeHook,
  type CollectionBeforeValidateHook,
  type CollectionConfig,
  type Field,
} from 'frogbot';

import { authorAccess, createAccess, readAccess } from './access.js';
import type { CommentsCollectionOverrides, CommentsEditor } from './types.js';

export const defaultCommentsSlug = 'comments';

type CollectionOptions = {
  bodies: Record<string, string>;
  editors: Map<string, CommentsEditor>;
  overrides: CommentsCollectionOverrides;
  userSlug: string;
};

const fixed = { update: () => false };

function defaultFields({ editors, userSlug }: CollectionOptions): Field[] {
  return [
    { name: 'collection', type: 'text', required: true, index: true, access: fixed },
    { name: 'documentId', type: 'text', required: true, index: true, access: fixed },
    {
      name: 'author',
      type: 'relationship',
      relationTo: userSlug,
      index: true,
      access: fixed,
      admin: { readOnly: true },
    },
    {
      name: 'mentions',
      type: 'relationship',
      relationTo: userSlug,
      hasMany: true,
      admin: { readOnly: true },
    },
    { name: 'bodyField', type: 'text', access: fixed, admin: { hidden: true } },
    ...[...editors].map(([name, editor]): Field => ({
      name,
      type: 'richText',
      editor,
      admin: { hidden: true },
    })),
    {
      name: 'body',
      type: 'json',
      virtual: true,
      hooks: {
        afterRead: [({ siblingData }) => siblingData[siblingData.bodyField as string] ?? null],
      },
    },
  ];
}

function hasContent(value: unknown): boolean {
  const visit = (node: unknown): boolean => {
    if (!node || typeof node !== 'object') return false;

    const { children, text, type } = node as Record<string, unknown>;

    if (typeof text === 'string') return text.trim() !== '';
    if (Array.isArray(children)) return children.some(visit);

    return typeof type === 'string' && type !== 'linebreak';
  };

  return visit((value as { root?: unknown } | null | undefined)?.root);
}

function placeBody(bodies: Record<string, string>): CollectionBeforeValidateHook {
  return ({ data, operation, originalDoc, req }) => {
    if (!data) return data;

    const { body, ...rest } = data;

    if (operation === 'create') {
      const bodyField = bodies[rest.collection as string];

      if (!bodyField) {
        throw new APIError(
          `Collection '${String(rest.collection)}' has no comments.`,
          400,
          null,
          true,
        );
      }

      return {
        ...rest,
        author: req.user ? req.user.id : rest.author,
        bodyField,
        ...(body === undefined ? {} : { [bodyField]: body }),
      };
    }

    const bodyField = originalDoc?.bodyField as string | undefined;

    return body === undefined || !bodyField ? rest : { ...rest, [bodyField]: body };
  };
}

const fillMentions: CollectionBeforeChangeHook = ({ data, operation, originalDoc }) => {
  const bodyField = (data.bodyField ?? originalDoc?.bodyField) as string;
  const body = data[bodyField];

  if ((operation === 'create' || body !== undefined) && !hasContent(body)) {
    throw new APIError('A comment needs some text.', 400, null, true);
  }

  return body === undefined ? data : { ...data, mentions: mentionedIds(body) };
};

function hideBodies(names: string[]): CollectionAfterReadHook {
  return ({ doc }) => {
    for (const name of names) delete doc[name];

    return doc;
  };
}

export function createCommentsCollection(options: CollectionOptions): CollectionConfig {
  const { fields: overrideFields, ...overrides } = options.overrides;
  const builtIns = defaultFields(options);
  const targets = Object.keys(options.bodies);
  const slug = overrides.slug ?? defaultCommentsSlug;

  return {
    versions: false,
    custom: { frogbot: { internal: true } },
    ...overrides,
    slug,
    admin: {
      icon: 'bubble-chat',
      views: [{ type: 'list', defaultFields: ['collection', 'documentId', 'author', 'createdAt'] }],
      ...overrides.admin,
    },
    access: {
      read: readAccess(targets),
      create: createAccess(targets),
      update: authorAccess(options.userSlug),
      delete: authorAccess(options.userSlug),
      ...overrides.access,
    },
    hooks: {
      ...overrides.hooks,
      beforeValidate: [placeBody(options.bodies), ...(overrides.hooks?.beforeValidate ?? [])],
      beforeChange: [fillMentions, ...(overrides.hooks?.beforeChange ?? [])],
      afterRead: [hideBodies([...options.editors.keys()]), ...(overrides.hooks?.afterRead ?? [])],
    },
    fields: overrideFields ? overrideFields({ defaultFields: builtIns }) : builtIns,
  };
}
