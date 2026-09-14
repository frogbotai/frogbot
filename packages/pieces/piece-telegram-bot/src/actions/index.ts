import type { PieceActionDefinition, PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import type { TelegramBotClient } from '../client.js';
import { loadTelegramFile, telegramFile } from '../files.js';

const jsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(z.string(), jsonValue),
  ]),
);
const chatId = z.union([z.string(), z.number()]).meta({ label: 'Chat ID' });
const messageId = z.number().int().meta({ label: 'Message ID' });
const parseMode = z.enum(['MarkdownV2', 'HTML', 'None']).default('MarkdownV2');
const replyMarkup = z.record(z.string(), jsonValue).optional();
const mediaSource = z.union([z.string().min(1), telegramFile]);
const response = z
  .object({
    ok: z.literal(true),
    result: z.unknown().optional(),
  })
  .passthrough();

type Input = Record<string, unknown>;

function snakeCase(value: string) {
  return value.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`);
}

function telegramValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(telegramValue);

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, child]) =>
        child === undefined || child === 'None' ? [] : [[snakeCase(key), telegramValue(child)]],
      ),
    );
  }

  return value;
}

function action<TInput extends z.ZodType<Input>>(
  slug: string,
  description: string,
  method: string,
  input: TInput,
): PieceActionDefinition<TInput, typeof response, object, TelegramBotClient> {
  return {
    slug,
    description,
    input,
    output: response,
    idempotent: false,
    async run({ client, input }) {
      return response.parse(await client.call(method, telegramValue(input)));
    },
  };
}

async function callWithFile(
  client: TelegramBotClient,
  req: PieceRunArgs<Input, object, TelegramBotClient>['req'],
  method: string,
  body: Input,
  field: string,
) {
  const source = body[field];

  if (typeof source === 'string') {
    return response.parse(await client.call(method, telegramValue(body)));
  }

  const file = await loadTelegramFile(req, telegramFile.parse(source));
  const values = z
    .record(z.string(), jsonValue)
    .parse(telegramValue({ ...body, [field]: undefined }));
  const form = new FormData();

  Object.entries(values).forEach(([key, value]) => {
    const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);

    if (serialized !== undefined) form.set(key, serialized);
  });

  form.set(field, file.data, file.name);

  return response.parse(await client.call(method, form));
}

const messageOptions = {
  messageThreadId: z.number().int().optional(),
  disableNotification: z.boolean().default(false),
  protectContent: z.boolean().default(false),
};
const replyOptions = {
  ...messageOptions,
  replyToMessageId: z.number().int().optional(),
  replyMarkup,
};

const sendTextMessageInput = z.object({
  chatId,
  message: z.string(),
  parseMode,
  disableWebPagePreview: z.boolean().default(false),
  ...replyOptions,
});

export const sendTextMessage = action(
  'sendTextMessage',
  'Send a text message through a Telegram bot.',
  'sendMessage',
  sendTextMessageInput,
);
sendTextMessage.run = async ({
  client,
  input,
}: PieceRunArgs<z.output<typeof sendTextMessageInput>, object, TelegramBotClient>) => {
  const { message, ...options } = input;
  const body = { ...options, text: message };

  return response.parse(await client.call('sendMessage', telegramValue(body)));
};

export const sendMedia = {
  ...action(
    'sendMedia',
    'Send a photo, video, sticker, or animation.',
    'sendPhoto',
    z.object({
      chatId,
      mediaType: z.enum(['photo', 'video', 'sticker', 'animation']),
      media: mediaSource,
      message: z.string().optional(),
      parseMode,
      ...replyOptions,
    }),
  ),
  async run({ client, input, req }: PieceRunArgs<Input, object, TelegramBotClient>) {
    const mediaType = z.enum(['photo', 'video', 'sticker', 'animation']).parse(input.mediaType);
    const method = {
      photo: 'sendPhoto',
      video: 'sendVideo',
      sticker: 'sendSticker',
      animation: 'sendAnimation',
    }[mediaType];
    const body = { ...input, [mediaType]: input.media, caption: input.message };

    delete body.mediaType;
    delete body.media;
    delete body.message;

    return callWithFile(client, req, method, body, mediaType);
  },
};

export const sendDocument = {
  ...action(
    'sendDocument',
    'Send a document to a Telegram chat.',
    'sendDocument',
    z.object({
      chatId,
      document: mediaSource,
      caption: z.string().optional(),
      parseMode,
      ...replyOptions,
    }),
  ),
  async run({ client, input, req }: PieceRunArgs<Input, object, TelegramBotClient>) {
    return callWithFile(client, req, 'sendDocument', input, 'document');
  },
};

export const sendAudio = {
  ...action(
    'sendAudio',
    'Send an audio file to a Telegram chat.',
    'sendAudio',
    z.object({
      chatId,
      audio: mediaSource,
      caption: z.string().optional(),
      parseMode,
      duration: z.number().int().nonnegative().optional(),
      performer: z.string().optional(),
      title: z.string().optional(),
      thumbnail: z.string().optional(),
      ...replyOptions,
    }),
  ),
  async run({ client, input, req }: PieceRunArgs<Input, object, TelegramBotClient>) {
    return callWithFile(client, req, 'sendAudio', input, 'audio');
  },
};

export const sendLocation = action(
  'sendLocation',
  'Send a geographic location to a Telegram chat.',
  'sendLocation',
  z.object({
    chatId,
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    horizontalAccuracy: z.number().min(0).max(1500).optional(),
    livePeriod: z.number().int().min(60).max(86400).optional(),
    heading: z.number().int().min(1).max(360).optional(),
    proximityAlertRadius: z.number().int().min(1).max(100000).optional(),
    ...replyOptions,
  }),
);

const mediaGroupItem = z.object({
  type: z.enum(['photo', 'video', 'audio', 'document']),
  media: z.string().min(1),
  caption: z.string().optional(),
  parseMode: z.enum(['MarkdownV2', 'HTML']).optional(),
});

export const sendMediaGroup = action(
  'sendMediaGroup',
  'Send an album of two to ten media items.',
  'sendMediaGroup',
  z.object({ chatId, media: z.array(mediaGroupItem).min(2).max(10), ...messageOptions }),
);

export const sendPoll = action(
  'sendPoll',
  'Send a native Telegram poll.',
  'sendPoll',
  z.object({
    chatId,
    question: z.string().min(1).max(300),
    options: z.array(z.string().min(1).max(100)).min(2).max(12),
    isAnonymous: z.boolean().default(true),
    type: z.enum(['regular', 'quiz']).default('regular'),
    allowsMultipleAnswers: z.boolean().default(false),
    correctOptionId: z.number().int().nonnegative().optional(),
    explanation: z.string().max(200).optional(),
    explanationParseMode: z.enum(['MarkdownV2', 'HTML']).optional(),
    openPeriod: z.number().int().min(5).max(600).optional(),
    closeDate: z.number().int().optional(),
    isClosed: z.boolean().default(false),
    ...replyOptions,
  }),
);

export const sendChatAction = action(
  'sendChatAction',
  'Show a temporary bot activity status in a chat.',
  'sendChatAction',
  z.object({
    chatId,
    messageThreadId: z.number().int().optional(),
    action: z.enum([
      'typing',
      'upload_photo',
      'record_video',
      'upload_video',
      'record_voice',
      'upload_voice',
      'upload_document',
      'choose_sticker',
      'find_location',
      'record_video_note',
      'upload_video_note',
    ]),
  }),
);

export const editMessageText = action(
  'editMessageText',
  'Edit a previously sent message.',
  'editMessageText',
  z
    .object({
      chatId: chatId.optional(),
      messageId: messageId.optional(),
      inlineMessageId: z.string().optional(),
      text: z.string(),
      parseMode,
      replyMarkup,
    })
    .refine(
      ({ chatId, messageId, inlineMessageId }) =>
        inlineMessageId !== undefined
          ? chatId === undefined && messageId === undefined
          : chatId !== undefined && messageId !== undefined,
      { message: 'Provide inlineMessageId or both chatId and messageId.' },
    ),
);

export const deleteMessage = action(
  'deleteMessage',
  'Delete a message.',
  'deleteMessage',
  z.object({ chatId, messageId }),
);

export const forwardMessage = action(
  'forwardMessage',
  'Forward a message to another chat.',
  'forwardMessage',
  z.object({ chatId, fromChatId: chatId, messageId, ...messageOptions }),
);

export const pinMessage = action(
  'pinMessage',
  'Pin a message in a chat.',
  'pinChatMessage',
  z.object({ chatId, messageId, disableNotification: z.boolean().default(false) }),
);

export const unpinMessage = action(
  'unpinMessage',
  'Unpin a message or the most recently pinned message.',
  'unpinChatMessage',
  z.object({ chatId, messageId: messageId.optional() }),
);

export const getChat = action(
  'getChat',
  'Get current information about a chat.',
  'getChat',
  z.object({ chatId }),
);

export const getChatMember = action(
  'getChatMember',
  'Get information about a member of a chat.',
  'getChatMember',
  z.object({ chatId, userId: z.number().int().positive() }),
);

const getFileOutput = z.object({
  fileInfo: z
    .object({
      file_id: z.string(),
      file_unique_id: z.string(),
      file_size: z.number().optional(),
      file_path: z.string().optional(),
    })
    .passthrough(),
  fileUrl: z.string().optional(),
  fileContentBase64: z.string().optional(),
});

export const getFile = {
  slug: 'getFile',
  description: 'Get file metadata and optionally download its content.',
  input: z.object({ fileId: z.string().min(1), download: z.boolean().default(false) }),
  output: getFileOutput,
  idempotent: true,
  async run({
    client,
    input,
  }: PieceRunArgs<{ fileId: string; download: boolean }, object, TelegramBotClient>) {
    const telegramResponse = await client.call('getFile', { file_id: input.fileId });
    const fileInfo = getFileOutput.shape.fileInfo.parse(telegramResponse.result);
    const fileUrl = fileInfo.file_path ? client.fileUrl(fileInfo.file_path) : undefined;
    const fileContentBase64 =
      input.download && fileInfo.file_path
        ? await client.downloadFile(fileInfo.file_path)
        : undefined;

    return { fileInfo, fileUrl, fileContentBase64 };
  },
};

export const createInviteLink = action(
  'createInviteLink',
  'Create an additional invite link for a chat.',
  'createChatInviteLink',
  z.object({
    chatId,
    name: z.string().max(32).optional(),
    expireDate: z.number().int().optional(),
    memberLimit: z.number().int().min(1).max(99999).optional(),
    createsJoinRequest: z.boolean().default(false),
  }),
);

export const answerCallbackQuery = action(
  'answerCallbackQuery',
  'Answer an inline keyboard callback query.',
  'answerCallbackQuery',
  z.object({
    callbackQueryId: z.string().min(1),
    text: z.string().max(200).optional(),
    showAlert: z.boolean().default(false),
    url: z.string().url().optional(),
    cacheTime: z.number().int().nonnegative().default(0),
  }),
);

const customOutput = z.unknown();
const customInput = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
  endpoint: z
    .string()
    .regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'Endpoint must be a Telegram Bot API method.'),
  headers: z.record(z.string(), z.string()).optional(),
  query: z.record(z.string(), jsonValue).optional(),
  body: jsonValue.optional(),
});

export const customApiCall = {
  slug: 'customApiCall',
  description: 'Call a Telegram Bot API endpoint directly.',
  input: customInput,
  output: customOutput,
  idempotent: false,
  async run({
    client,
    input,
  }: PieceRunArgs<z.output<typeof customInput>, object, TelegramBotClient>) {
    return client.request(input.endpoint, input);
  },
};
