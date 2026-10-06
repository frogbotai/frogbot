import type { Adapter } from 'chat';

import type { AgentInstance } from '../../agents/types.js';
import type { KV } from '../../kv/types.js';
import type { ChannelQuestionsBinding } from '../types.js';
import { createQuestionStore } from './createQuestionStore.js';
import type { PieceChannelQuestions } from './types.js';

export function createQuestionsBinding({
  adapter,
  agent,
  hooks,
  kv,
  namespace,
}: {
  adapter: Adapter;
  agent?: AgentInstance;
  hooks?: PieceChannelQuestions<never>;
  kv: KV;
  namespace: string;
}): ChannelQuestionsBinding | undefined {
  if (!hooks || !agent) return undefined;

  return {
    hooks,
    store: createQuestionStore({ adapter, kv, namespace }),
  };
}
