import type { PieceChannelQuestions } from 'frogbot/pieces';

import type { GithubClient } from '../client.js';
import { questionPages } from './comments.js';
import { postComments } from './githubThread.js';
import type { GithubQuestionState } from './state.js';

export const renderGithubQuestion: PieceChannelQuestions<GithubClient>['render'] = async ({
  calls,
  thread,
}) => {
  const [call] = calls;

  if (!call) return [];

  const messages = await postComments({ bodies: questionPages({ call, q: 0 }), q: 0, thread });

  return [
    {
      calls: [call.toolCallId],
      messages,
      state: { q: 0, answers: [], by: [] } satisfies GithubQuestionState,
    },
  ];
};
