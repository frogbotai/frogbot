import type { ActionEvent, Message as ChatMessage, ModalSubmitEvent, Thread } from 'chat';

import type { PendingCall, TurnActor } from '../../chat/turn/types.js';
import type { DocID } from '../../collections/config/types.js';
import type { QuestionInput, QuestionOutput } from '../../tools/question.js';
import type { FrogBotRequest } from '../../types/request.js';
import type { ChannelThreadReference } from '../types.js';

export type ChannelQuestionCall = Omit<PendingCall, 'input'> & { input: QuestionInput };

export type QuestionInteraction =
  | { type: 'action'; event: ActionEvent }
  | { type: 'modalSubmit'; event: ModalSubmitEvent }
  | { type: 'message'; message: ChatMessage };

export type QuestionMessage = {
  id: string;
  postedAt: string;
  question?: number;
};

export type QuestionRecord = Readonly<{
  messages: QuestionMessage[];
  revision: number;
  state?: unknown;
}>;

export type QuestionChange = {
  messages?: QuestionMessage[];
  state?: unknown;
};

export type RenderedQuestion = {
  calls: string[];
  messages: QuestionMessage[];
  state?: unknown;
};

export type QuestionParseResult =
  | { kind: 'answer'; output: QuestionOutput }
  | { kind: 'dismiss' }
  | { kind: 'partial'; state?: unknown }
  | { kind: 'rejected'; reason: string }
  | { kind: 'stale' }
  | { kind: 'ignore' };

export type QuestionOutcome = { output: QuestionOutput } | { dismissed: true };

export type QuestionHookArgs<TClient> = {
  call: ChannelQuestionCall;
  client: TClient;
  question: QuestionRecord;
  req: FrogBotRequest;
  thread: Thread;
};

export type PieceChannelQuestions<TClient = unknown> = {
  supports?(args: { thread: Thread }): boolean;
  render(args: {
    calls: ChannelQuestionCall[];
    client: TClient;
    req: FrogBotRequest;
    thread: Thread;
  }): Promise<RenderedQuestion[]>;
  parse(args: {
    call: ChannelQuestionCall;
    interaction: QuestionInteraction;
    question: QuestionRecord;
    settled: boolean;
  }): QuestionParseResult;
  updated?(
    args: QuestionHookArgs<TClient> & { interaction?: QuestionInteraction },
  ): Promise<QuestionChange | void>;
  settled(
    args: QuestionHookArgs<TClient> & { actor: TurnActor | null; outcome: QuestionOutcome },
  ): Promise<QuestionChange | void>;
  rejected?(
    args: QuestionHookArgs<TClient> & { interaction: QuestionInteraction; reason: string },
  ): Promise<void>;
  denied?(args: QuestionHookArgs<TClient> & { interaction: QuestionInteraction }): Promise<void>;
  stale?(args: QuestionHookArgs<TClient> & { interaction: QuestionInteraction }): Promise<void>;
};

export type StoredQuestion = {
  call: ChannelQuestionCall;
  chatId: DocID;
  messages: QuestionMessage[];
  pending?: 'update';
  revision: number;
  settled?: { at: string };
  state?: unknown;
  thread: ChannelThreadReference['thread'];
};
