import type { PieceChannelQuestions } from 'frogbot/pieces';

import type { GithubClient } from '../client.js';
import { answeredComment, closedPageComment, questionPages } from './comments.js';
import { editComments, postComments } from './githubThread.js';
import { commentsFor, readState } from './state.js';

export const updateGithubQuestion: NonNullable<
  PieceChannelQuestions<GithubClient>['updated']
> = async ({ call, question, req, thread }) => {
  const { answers, by, q } = readState(question.state);

  const posted = await postComments({ bodies: questionPages({ call, q }), q, thread });

  const answered = q - 1;

  await editComments({
    edits: commentsFor({ question, q: answered }).map(({ id }, page) => ({
      id,
      body:
        page === 0
          ? answeredComment({ answer: answers[answered], by: by[answered], call, q: answered })
          : closedPageComment({ call, q: answered }),
    })),
    req,
    thread,
    toolCallId: call.toolCallId,
  });

  return { messages: [...question.messages, ...posted] };
};
