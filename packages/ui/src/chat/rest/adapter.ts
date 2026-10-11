import {
  type AgentManifest,
  createFrogBotSDK,
  type FrogBotSDK,
  FrogBotSDKError,
} from '@frogbotai/sdk';
import type { ManifestResponse, TurnState } from 'frogbot';

import {
  ChatAdapterError,
  type ChatDocument,
  type ChatId,
  type ChatManifest,
  type ChatPage,
  type ChatPlatformAdapter,
  type StoredAttachment,
  type ToolCallSettlement,
} from '../adapter.js';
import { type MessageDocument, messageDocumentToUIMessage } from '../messages.js';
import { chatRequest, type PayloadPage } from './request.js';
import { FrogBotChatTransport, prepareChatRequest } from './transport.js';

export type RestChatAdapterOptions = {
  apiBase?: string;
  fetch: typeof globalThis.fetch;
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  chatsSlug?: string;
  messagesSlug?: string;
  assetsSlug?: string;
};

type ChatSlug = 'chatsSlug' | 'messagesSlug' | 'assetsSlug';

type StoredAsset = {
  filename: string;
  mimeType: string;
  filesize?: number | null;
  text?: string | null;
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function segment(value: ChatId) {
  return encodeURIComponent(String(value));
}

function isFileRefusal(error: FrogBotSDKError): boolean {
  if (error.status !== 400) return false;

  const [detail] = error.errors;
  const data = detail?.data as { errors?: { path?: unknown }[] } | undefined;

  return Boolean(data?.errors?.some((entry) => entry.path === 'file'));
}

function createSDK({ apiBase = '/api', fetch, headers }: RestChatAdapterOptions): FrogBotSDK {
  return createFrogBotSDK({
    baseURL: apiBase,
    fetch: async (input, init) => {
      const merged = new Headers(await (typeof headers === 'function' ? headers() : headers));

      new Headers(init?.headers).forEach((value, key) => merged.set(key, value));

      return fetch(input, { ...init, headers: merged });
    },
  });
}

/** Builds the chat adapter for a FrogBot server's REST API. */
export function createRestChatAdapter(options: RestChatAdapterOptions): ChatPlatformAdapter {
  const sdk = createSDK(options);
  let serverManifest: Promise<ManifestResponse> | undefined;
  let pending: Promise<ManifestResponse> | undefined;

  const fetchServerManifest = () => {
    const current: Promise<ManifestResponse> = chatRequest<ManifestResponse>(sdk, '/frogbot').then(
      (manifest) => {
        if (pending === current) pending = undefined;

        return manifest;
      },
      (error: unknown) => {
        if (pending === current) pending = undefined;
        if (serverManifest === current) serverManifest = undefined;

        throw error;
      },
    );

    serverManifest = pending = current;

    return current;
  };

  const loadServerManifest = () => serverManifest ?? fetchServerManifest();

  const slug = async (name: ChatSlug) => {
    const given = options[name];

    if (given) return given;

    const { chat } = await loadServerManifest();

    if (!chat.enabled) throw new Error('FrogBot chat is disabled');

    return chat[name];
  };

  const chatPath = async (chatId: ChatId) =>
    `/${encodeURIComponent(await slug('chatsSlug'))}/${segment(chatId)}`;

  const patchChat = async (chatId: ChatId, data: Partial<ChatDocument>) =>
    chatRequest<ChatDocument>(sdk, await chatPath(chatId), {
      method: 'PATCH',
      body: JSON.stringify(data),
      headers: JSON_HEADERS,
    });

  return {
    loadManifest: async ({ signal }): Promise<ChatManifest | null> => {
      const [server, agents] = await Promise.all([
        pending ?? fetchServerManifest(),
        chatRequest<AgentManifest>(sdk, '/agents', { signal }),
      ]);

      if (!server.chat.enabled) return null;

      return {
        defaultAgent: agents.defaultAgent,
        agents: agents.agents.map((entry) => {
          const profile = server.agents.find(({ slug }) => slug === entry.slug)?.profile;

          return profile ? { ...entry, profile } : entry;
        }),
        transcribe: server.ai.transcribe !== false,
      };
    },
    createTransport: ({ agent, request, onChatId }) =>
      new FrogBotChatTransport({
        agentSlug: agent,
        sdk,
        onChatId,
        prepareSendMessagesRequest: prepareChatRequest({
          chatId: () => request().chatId,
          model: () => request().model,
          reasoning: () => request().reasoning,
        }),
      }),
    listChats: async ({ agent, page, limit }) => {
      const params = new URLSearchParams({
        depth: '0',
        sort: '-lastMessageAt',
        page: String(page),
        limit: String(limit),
      });

      if (agent) params.set('where[agent][equals]', agent);

      return chatRequest<ChatPage>(
        sdk,
        `/${encodeURIComponent(await slug('chatsSlug'))}?${params}`,
      );
    },
    getChat: async (chatId) => chatRequest<ChatDocument>(sdk, `${await chatPath(chatId)}?depth=0`),
    loadMessages: async (chatId) => {
      const params = new URLSearchParams({
        depth: '0',
        limit: '0',
        sort: 'createdAt',
        'where[chat][equals]': String(chatId),
      });

      const page = await chatRequest<PayloadPage<MessageDocument>>(
        sdk,
        `/${encodeURIComponent(await slug('messagesSlug'))}?${params}`,
      );

      return {
        messages: page.docs
          .filter(({ status }) => status !== 'queued')
          .map(messageDocumentToUIMessage),
        queued: page.docs
          .filter(({ status }) => status === 'queued')
          .map(messageDocumentToUIMessage),
      };
    },
    renameChat: (chatId, title) => patchChat(chatId, { title }),
    updateChatAgent: (chatId, agent) => patchChat(chatId, { agent }),
    deleteChat: async (chatId) => {
      const messagesPath = `/${encodeURIComponent(await slug('messagesSlug'))}`;
      const params = new URLSearchParams({
        depth: '0',
        limit: '0',
        'where[chat][equals]': String(chatId),
      });

      const messages = await chatRequest<PayloadPage<MessageDocument>>(
        sdk,
        `${messagesPath}?${params}`,
      );

      await Promise.all(
        messages.docs.map((message) =>
          chatRequest(sdk, `${messagesPath}/${segment(message.id)}`, { method: 'DELETE' }),
        ),
      );

      await chatRequest(sdk, await chatPath(chatId), { method: 'DELETE' });
    },
    branchChat: async (chatId, messageId) => {
      const result = await chatRequest<{ chatId: ChatId }>(sdk, '/frogbot/chat/branch', {
        method: 'POST',
        body: JSON.stringify({ chatId, messageId }),
        headers: JSON_HEADERS,
      });

      return result.chatId;
    },
    suggestChatTitle: async (chatId) => {
      const result = await chatRequest<{ suggestion: string | null }>(
        sdk,
        '/frogbot/chat/suggest-title',
        { method: 'POST', body: JSON.stringify({ chatId }), headers: JSON_HEADERS },
      );

      return result.suggestion ?? undefined;
    },
    loadTurnState: async (agent, chatId) => {
      const { state } = await chatRequest<{ state: TurnState }>(
        sdk,
        `/agents/${encodeURIComponent(agent)}/chats/${segment(chatId)}/pending`,
      );

      return state;
    },
    dismissToolCall: async (agent, chatId, toolCallId) => {
      const path = `/agents/${encodeURIComponent(agent)}/chats/${segment(chatId)}/settle`;

      const result = await chatRequest<{ settlement: ToolCallSettlement }>(sdk, path, {
        method: 'POST',
        body: JSON.stringify({ toolCallId, dismissed: true }),
        headers: JSON_HEADERS,
      }).catch(async (error: unknown) => {
        if (!(error instanceof FrogBotSDKError) || error.status !== 409) throw error;

        const body = (await error.response.json()) as { settlement?: ToolCallSettlement };

        if (!body.settlement) {
          throw new ChatAdapterError('conflict', error.message, { cause: error });
        }

        return { settlement: body.settlement };
      });

      return result.settlement;
    },
    uploadAttachment: async (file) => {
      try {
        const uploaded = await sdk.upload(await slug('assetsSlug'), file);

        return {
          id: uploaded.id,
          mediaType: uploaded.mimeType,
          ...(typeof uploaded.text === 'string' ? { text: uploaded.text } : {}),
        };
      } catch (error) {
        if (!(error instanceof FrogBotSDKError)) throw error;

        if (isFileRefusal(error)) {
          throw new ChatAdapterError('file-unreadable', error.message, { cause: error });
        }

        if (error.status === 413) {
          throw new ChatAdapterError('file-too-large', error.message, { cause: error });
        }

        throw error;
      }
    },
    readAttachment: async (id, { signal }): Promise<StoredAttachment> => {
      const collectionPath = `/${encodeURIComponent(await slug('assetsSlug'))}`;
      const asset = await chatRequest<StoredAsset>(
        sdk,
        `${collectionPath}/${segment(id)}?depth=0`,
        { signal },
      );

      signal.throwIfAborted();

      if (!asset.filename || !asset.mimeType) throw new Error('Attachment unavailable');

      const stored = { filename: asset.filename, mediaType: asset.mimeType };

      if (typeof asset.text === 'string') return { ...stored, text: asset.text };

      const response = await sdk.request(
        `${collectionPath}/file/${encodeURIComponent(asset.filename)}`,
        { signal },
      );

      return {
        ...stored,
        ...(asset.filesize == null ? {} : { filesize: asset.filesize }),
        blob: await response.blob(),
      };
    },
    transcribe: async (file) => {
      const { ai } = await loadServerManifest();

      if (!ai.transcribe) throw new Error('Transcription is not available');

      const result = await sdk.ai.transcribe({ file, model: ai.transcribe.model });

      return result.text;
    },
  };
}
