import type { ChannelThreadReference, ChatManifest, TurnState } from '@frogbotai/protocol';
import type { ChatTransport, UIMessage } from 'ai';

import type { ToolPartValue } from './tool-registry.js';

export type ChatId = string | number;

export type ChatDocument = {
  id: ChatId;
  title?: string | null;
  agent: string;
  lastMessageAt?: string | null;
  channel?: string | null;
  channelLabel?: string | null;
  channelThread?: ChannelThreadReference | null;
};

export type ChatPage = {
  docs: ChatDocument[];
  page: number;
  totalDocs: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
};

export type ChatMessages = {
  messages: UIMessage[];
  queued: UIMessage[];
};

export type ChatRequestState = {
  chatId?: ChatId;
  model?: string;
  reasoning?: string;
};

export type ChatTransportOptions = {
  agent: string;
  request: () => ChatRequestState;
  onChatId: (chatId: ChatId) => void;
};

export type ToolCallSettlement = {
  status: 'settled' | 'already-settled';
  allSettled: boolean;
  part: ToolPartValue;
};

export type UploadedAttachment = {
  id: ChatId;
  mediaType: string;
  text?: string;
};

export type StoredAttachment = {
  filename: string;
  mediaType: string;
  filesize?: number;
} & ({ text: string } | { blob: Blob });

/**
 * The chat UI's only route to a backend. Optional members are capabilities: the UI hides the
 * feature behind each one the adapter leaves out.
 */
export type ChatPlatformAdapter = {
  loadManifest: (options: { signal: AbortSignal }) => Promise<ChatManifest | null>;
  createTransport: (options: ChatTransportOptions) => ChatTransport<UIMessage>;
  listChats: (options: { agent?: string; page: number; limit: number }) => Promise<ChatPage>;
  getChat: (chatId: ChatId) => Promise<ChatDocument>;
  loadMessages: (chatId: ChatId) => Promise<ChatMessages>;
  renameChat?: (chatId: ChatId, title: string) => Promise<ChatDocument>;
  deleteChat?: (chatId: ChatId) => Promise<void>;
  exportChat?: (chatId: ChatId) => Promise<void>;
  updateChatAgent?: (chatId: ChatId, agent: string) => Promise<ChatDocument>;
  branchChat?: (chatId: ChatId, messageId: string) => Promise<ChatId>;
  suggestChatTitle?: (chatId: ChatId) => Promise<string | undefined>;
  loadTurnState?: (agent: string, chatId: ChatId) => Promise<TurnState>;
  dismissToolCall?: (
    agent: string,
    chatId: ChatId,
    toolCallId: string,
  ) => Promise<ToolCallSettlement>;
  uploadAttachment?: (file: File) => Promise<UploadedAttachment>;
  readAttachment?: (id: ChatId, options: { signal: AbortSignal }) => Promise<StoredAttachment>;
  transcribe?: (file: File) => Promise<string>;
  /** Turns text into audio for read aloud; the UI plays the returned blob. */
  speak?: (text: string, options: { signal: AbortSignal }) => Promise<Blob>;
  buildMetadata?: (
    message: UIMessage,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
  executeClientTool?: (name: string, input: unknown) => unknown;
  /** Hands a queued message to the running turn, which takes it at its next step. */
  steerMessage?: (chatId: ChatId, message: UIMessage) => Promise<void>;
};

export type ChatAdapterErrorCode = 'conflict' | 'file-unreadable' | 'file-too-large';

/** An adapter failure the chat UI recovers from or explains, keyed by `code`. */
export class ChatAdapterError extends Error {
  readonly code: ChatAdapterErrorCode;

  constructor(code: ChatAdapterErrorCode, message: string = code, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ChatAdapterError';
    this.code = code;
  }
}
