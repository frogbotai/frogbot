import { ValidationError } from 'payload';

import { scopeWhere, uploadBytes, uploadText } from '../chat/collections/assets.js';
import { estimateTokens } from '../chat/compaction/estimate.js';
import type { Access, CollectionConfig } from '../collections/config/types.js';
import type { Field } from '../fields/config/types.js';
import { attachmentKind, decodeText, HEAD_BYTES } from '../uploads/attachmentParts.js';
import { hashUpload } from '../uploads/hashUpload.js';
import { limitText } from '../uploads/office/limitText.js';
import { canAccessSpace, spaceAccess } from './access.js';
import { spaceIDOf } from './run.js';

export const DEFAULT_SPACES_SLUG = 'spaces';

export const SPACE_FILES_SLUG = 'frogbot-space-files';

/** The tokens a Space's instructions may hold. They sit in every chat's system prompt. */
export const SPACE_INSTRUCTIONS_TOKEN_LIMIT = 2_000;

const owner: Access = ({ req }) =>
  req.user?.id !== undefined ? { user: { equals: req.user.id } } : false;

function instructionsField(): Field {
  return {
    name: 'instructions',
    type: 'textarea',
    admin: {
      description: 'Every chat in this Space follows these, after the agent’s own instructions.',
    },
    validate: (value: unknown) =>
      typeof value !== 'string' || estimateTokens(value) <= SPACE_INSTRUCTIONS_TOKEN_LIMIT
        ? true
        : `Instructions can hold about ${SPACE_INSTRUCTIONS_TOKEN_LIMIT.toLocaleString('en-US')} tokens. Shorten them, or move detail into a file.`,
  };
}

function filesField(): Field {
  return {
    name: 'files',
    type: 'join',
    collection: SPACE_FILES_SLUG,
    on: 'space',
    admin: { defaultColumns: ['filename', 'mimeType', 'filesize', 'updatedAt'] },
  };
}

/** The fields and hooks every Space collection gets, whether core makes it or the app marks its own with `space: true`. */
export function spaceBase(slug: string): CollectionConfig {
  return { slug, fields: [instructionsField(), filesField()] };
}

export function defaultSpacesCollection({
  slug,
  userSlug,
}: {
  slug: string;
  userSlug: string;
}): CollectionConfig {
  return {
    slug,
    admin: {
      icon: 'folder',
      useAsTitle: 'title',
      views: [{ type: 'list', defaultFields: ['title', 'user', 'updatedAt'] }],
    },
    access: {
      create: ({ req }) => Boolean(req.user),
      read: owner,
      update: owner,
      delete: owner,
    },
    fields: [
      { name: 'title', type: 'text', required: true },
      ...spaceBase(slug).fields,
      {
        name: 'user',
        type: 'relationship',
        relationTo: userSlug,
        index: true,
        admin: { position: 'sidebar' },
        hooks: {
          beforeChange: [
            ({ operation, originalDoc, overrideAccess, req, value }) => {
              if (overrideAccess) return value ?? req.user?.id;

              return operation === 'create'
                ? req.user?.id
                : (originalDoc as { user?: unknown } | undefined)?.user;
            },
          ],
        },
      },
    ],
  };
}

async function fileText({
  req,
  collection,
}: Parameters<typeof uploadText>[0]): Promise<string | null> {
  const office = await uploadText({ req, collection });

  if (office !== null || !req.file) return office;

  const bytes = await uploadBytes(req.file);
  const kind = attachmentKind({
    mediaType: req.file.mimetype,
    filename: req.file.name,
    head: bytes.subarray(0, HEAD_BYTES),
  });

  return kind === 'text' ? limitText({ text: decodeText(bytes), filename: req.file.name }) : null;
}

export function spaceFilesCollection({ spacesSlug }: { spacesSlug: string }): CollectionConfig {
  const scoped =
    (kind: 'read' | 'update'): Access =>
    async ({ req }) => {
      const spaces = await spaceAccess({ req, spacesSlug, kind });

      if (spaces === true || spaces === false) return spaces;

      return scopeWhere(spaces, 'space');
    };

  const updatable = scoped('update');

  const create: Access = async ({ data, req }) => {
    const target = spaceIDOf((data as { space?: unknown } | undefined)?.space);

    return target !== undefined && canAccessSpace({ req, id: target, kind: 'update' });
  };

  const update: Access = async (args) => {
    const target = spaceIDOf((args.data as { space?: unknown } | undefined)?.space);

    if (
      target !== undefined &&
      !(await canAccessSpace({ req: args.req, id: target, kind: 'update' }))
    ) {
      return false;
    }

    return updatable(args);
  };

  return {
    slug: SPACE_FILES_SLUG,
    versions: false,
    authorship: false,
    custom: { frogbot: { internal: true } },
    typescript: { interface: 'FrogBotSpaceFile' },
    upload: true,
    admin: { hidden: true, useAsTitle: 'filename' },
    graphQL: false,
    access: {
      create,
      read: scoped('read'),
      update,
      delete: updatable,
    },
    hooks: {
      beforeChange: [
        async ({ collection, data, req }) => {
          if (!req.file) return data;

          const text = await fileText({ req, collection: collection.slug });

          if (text === null) {
            throw new ValidationError({
              collection: collection.slug,
              errors: [
                {
                  path: 'file',
                  message: `${req.file.name} isn't a file an agent can read. Add text, Markdown, CSV, JSON, code, Word or Excel files.`,
                },
              ],
            });
          }

          return { ...data, sha256: await hashUpload(req.file), text };
        },
      ],
    },
    fields: [
      { name: 'space', type: 'relationship', relationTo: spacesSlug, required: true, index: true },
      { name: 'sha256', type: 'text', hidden: true },
      { name: 'text', type: 'textarea', admin: { hidden: true } },
    ],
  };
}
