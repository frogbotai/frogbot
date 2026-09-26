import type { PieceChannelQuestions } from 'frogbot/pieces';

import type { GithubClient } from '../client.js';
import { answeredComment, closedPageComment } from './comments.js';
import { editComments } from './githubThread.js';
import { type GithubQuestionState, readState } from './state.js';

export const settleGithubQuestion: PieceChannelQuestions<GithubClient>['settled'] = async ({
  actor,
  call,
  outcome,
  question,
  req,
  thread,
}) => {
  const state = readState(question.state);
  const output = 'output' in outcome ? outcome.output : undefined;
  const login =
    actor?.channel?.piece === 'github' ? actor.channel.username || actor.channel.id : '';

  const bodyFor = (q: number) => {
    const current = q === state.q;
    const answer = output?.answers[q] ?? (current ? undefined : state.answers[q]);
    const by = current ? login : state.by[q];

    return answeredComment({ answer, by: by || undefined, call, q });
  };

  const seen = new Set<number>();

  const edits = question.messages.map(({ id, question: q = 0 }) => {
    const first = !seen.has(q);

    seen.add(q);

    return { id, body: first ? bodyFor(q) : closedPageComment({ call, q }) };
  });

  await editComments({ edits, req, thread, toolCallId: call.toolCallId });

  const closed = { dismissed: !output, ...(login ? { by: login } : {}) };

  return { state: { ...state, closed } satisfies GithubQuestionState };
};
