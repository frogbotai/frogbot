import { readFile } from 'node:fs/promises';

import { type PayloadRequest, ValidationError } from 'payload';

import type { Access, AccessResult, CollectionConfig } from '../../collections/config/types.js';
import { toPayloadRequest } from '../../seams/request.js';
import type { Where } from '../../types/payload.js';
import type { FrogBotRequest } from '../../types/request.js';
import { hashUpload } from '../../uploads/hashUpload.js';
import { officeKind, officeText } from '../../uploads/office/officeText.js';
import { OfficeFileError, type OfficeFileErrorReason } from '../../uploads/office/zipGuard.js';

export const CHAT_ASSETS_SLUG = 'frogbot-chat-assets';

export const SKIP_ASSET_TEXT_CONTEXT_KEY = 'frogbotSkipAssetText';

const REFUSAL_CAUSES: Record<OfficeFileErrorReason, string> = {
  invalid: "it isn't a valid Word or Excel file",
  encrypted: 'it is password-protected',
  'too-large': 'it is too large when expanded',
};

type UploadedFile = NonNullable<PayloadRequest['file']>;

export type DefaultChatAssetsCollectionProps = {
  chatsSlug: string;
  userSlug: string;
};

export function scopeWhere(where: Where, prefix: string): Where {
  const scoped: Where = {};

  for (const [key, value] of Object.entries(where)) {
    if ((key === 'and' || key === 'or') && Array.isArray(value)) {
      scoped[key] = value.map((entry) => scopeWhere(entry, prefix));
    } else {
      scoped[`${prefix}.${key}`] = value;
    }
  }

  return scoped;
}

async function readableChats({
  req,
  chatsSlug,
}: {
  req: FrogBotRequest;
  chatsSlug: string;
}): Promise<AccessResult> {
  const payloadConfig = await req.frogbot.config._internal.payloadConfig;
  const chats = payloadConfig.collections.find(({ slug }) => slug === chatsSlug);
  const read = chats?.access.read;

  if (!read) return Boolean(req.user);

  return read({ req: toPayloadRequest(req) });
}

async function uploadBytes({ data, tempFilePath }: UploadedFile): Promise<Uint8Array> {
  if (data?.byteLength || !tempFilePath) return data ?? new Uint8Array();

  return readFile(tempFilePath);
}

async function uploadText({
  req,
  collection,
}: {
  req: FrogBotRequest;
  collection: string;
}): Promise<string | null> {
  const file = req.file;

  if (!file || req.context[SKIP_ASSET_TEXT_CONTEXT_KEY]) return null;

  const kind = officeKind({ mediaType: file.mimetype, filename: file.name });

  if (!kind) return null;

  const bytes = await uploadBytes(file);

  return officeText({ bytes, filename: file.name, kind }).catch((error: unknown) => {
    if (!(error instanceof OfficeFileError)) throw error;

    const message = `${file.name} couldn't be read: ${REFUSAL_CAUSES[error.reason]}.`;

    throw new ValidationError({ collection, errors: [{ path: 'file', message }] });
  });
}

export function defaultChatAssetsCollection({
  chatsSlug,
  userSlug,
}: DefaultChatAssetsCollectionProps): CollectionConfig {
  const read: Access = async ({ req }) => {
    const clauses: Where[] = [];

    if (req.user) clauses.push({ owner: { equals: req.user.id } });

    const chats = await readableChats({ req, chatsSlug });

    if (chats === true) clauses.push({ chat: { exists: true } });
    else if (chats) clauses.push(scopeWhere(chats, 'chat'));

    if (clauses.length === 0) return false;

    return { or: clauses };
  };

  return {
    slug: CHAT_ASSETS_SLUG,
    typescript: { interface: 'FrogBotChatAsset' },
    upload: true,
    admin: { hidden: true },
    graphQL: false,
    access: {
      create: ({ req }) => Boolean(req.user),
      read,
      update: () => false,
      delete: () => false,
    },
    hooks: {
      beforeChange: [
        async ({ collection, data, operation, req }) => ({
          ...data,
          sha256: req.file ? await hashUpload(req.file) : undefined,
          ...(operation === 'create'
            ? { text: await uploadText({ req, collection: collection.slug }) }
            : {}),
        }),
      ],
    },
    fields: [
      {
        name: 'owner',
        type: 'relationship',
        relationTo: userSlug,
        index: true,
        hooks: {
          beforeChange: [({ req, value }) => value ?? req.user?.id],
        },
      },
      { name: 'chat', type: 'relationship', relationTo: chatsSlug, index: true },
      { name: 'sha256', type: 'text', hidden: true },
      { name: 'text', type: 'textarea' },
    ],
  };
}
