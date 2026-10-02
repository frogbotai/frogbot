import type { ToolCtx } from '../tools/types.js';
import { SKIP_ASSET_TEXT_CONTEXT_KEY } from './collections/assets.js';

export type SaveChatAssetProps = {
  ctx: ToolCtx;
  filename: string;
  mimeType: string;
  data: Buffer | Uint8Array;
};

export type ChatAsset = {
  id: string | number;
  filename: string;
  mimeType: string;
  filesize: number;
  url: string;
};

export async function saveChatAsset({
  ctx,
  filename,
  mimeType,
  data,
}: SaveChatAssetProps): Promise<ChatAsset> {
  const chat = ctx.req.frogbot.config.chat;

  if (!chat.enabled || ctx.agent.chatId === undefined) {
    throw new Error('[frogbot] saveChatAsset requires chat persistence and a current chat.');
  }

  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

  const owner = ctx.req.user?.id;
  const skipText = ctx.req.context?.[SKIP_ASSET_TEXT_CONTEXT_KEY];

  try {
    const doc = await ctx.req.frogbot.create({
      collection: chat.assetsSlug,
      data: { chat: ctx.agent.chatId, ...(owner !== undefined ? { owner } : {}) },
      file: { data: buffer, mimetype: mimeType, name: filename, size: buffer.byteLength },
      context: { [SKIP_ASSET_TEXT_CONTEXT_KEY]: true },
      depth: 0,
      req: ctx.req,
      overrideAccess: true,
    });

    return doc as unknown as ChatAsset;
  } finally {
    if (skipText === undefined) delete ctx.req.context[SKIP_ASSET_TEXT_CONTEXT_KEY];
    else ctx.req.context[SKIP_ASSET_TEXT_CONTEXT_KEY] = skipText;
  }
}
