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

export type QuestionParseResult =
  | { kind: 'answer'; output: QuestionOutput }
  | { kind: 'dismiss' }
  | { kind: 'partial'; state?: unknown }
  | { kind: 'rejected'; reason: string }
  | { kind: 'ignore' };

export type QuestionOutcome = { output: QuestionOutput } | { dismissed: true };

export type RenderedQuestion = {
  messageId: string;
  calls: string[];
  state?: unknown;
};

export type QuestionHookArgs<TClient> = {
  call: ChannelQuestionCall;
  client: TClient;
  messageId: string;
  req: FrogBotRequest;
  state?: unknown;
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
    settled: boolean;
    state?: unknown;
  }): QuestionParseResult;
  settled(
    args: QuestionHookArgs<TClient> & { actor: TurnActor | null; outcome: QuestionOutcome },
  ): Promise<void>;
  updated?(
    args: QuestionHookArgs<TClient> & { interaction: QuestionInteraction },
  ): Promise<{ messageId?: string } | void>;
  rejected?(
    args: QuestionHookArgs<TClient> & { interaction: QuestionInteraction; reason: string },
  ): Promise<void>;
  denied?(args: QuestionHookArgs<TClient> & { interaction: QuestionInteraction }): Promise<void>;
  stale?(args: QuestionHookArgs<TClient> & { interaction: QuestionInteraction }): Promise<void>;
};

export type QuestionDelivery = {
  call: ChannelQuestionCall;
  chatId: DocID;
  messageId: string;
  thread: ChannelThreadReference['thread'];
  state?: unknown;
  settled?: true;
};
