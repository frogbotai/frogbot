import type { Adapter, Author, SerializedMessage, SerializedThread } from 'chat';

import type { AgentInstance } from '../agents/types.js';
import type { DocID } from '../collections/config/types.js';
import type { PieceInstance } from '../pieces/types.js';
import type { ChannelChat } from './chat.js';
import type { QuestionDeliveryStore } from './questions/createQuestionDeliveryStore.js';
import type { PieceChannelQuestions } from './questions/types.js';

export type ChannelContext = {
  piece: string;
  threadId: string;
  author: {
    id: string;
    username?: string;
    name?: string;
  };
};

export type ChannelConversationIdentity = {
  agent: string;
  piece: string;
  account: string;
  kind: string;
  peer: string;
  parent?: string;
  thread?: string;
};

export type ChannelThreadReference = {
  account: string;
  thread: Omit<SerializedThread, 'currentMessage'>;
};

export type ChannelBinding = {
  adapter: Adapter;
  chat: ChannelChat;
  instance: PieceInstance;
} & (
  | { kind: 'conversation'; agent: AgentInstance; questions?: ChannelQuestionsBinding }
  | { kind: 'ingress' }
);

export type ChannelConversationBinding = Extract<ChannelBinding, { kind: 'conversation' }>;

export type ChannelQuestionsBinding = {
  deliveries: QuestionDeliveryStore;
  hooks: PieceChannelQuestions;
};

type ChannelTaskBase = {
  agentSlug: string;
  instanceSlug: string;
  thread: SerializedThread;
};

export type ChannelTaskInput =
  | (ChannelTaskBase & { kind?: 'message'; message: SerializedMessage })
  | (ChannelTaskBase & { kind: 'continue'; chatId: DocID; responder: Author })
  | (ChannelTaskBase & { kind: 'promote'; chatId: DocID });
