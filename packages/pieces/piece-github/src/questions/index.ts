import type { PieceChannelQuestions } from 'frogbot/pieces';

import type { GithubClient } from '../client.js';
import { denyGithubQuestion, rejectGithubQuestion, staleGithubQuestion } from './notify.js';
import { parseGithubQuestion } from './parse.js';
import { renderGithubQuestion } from './render.js';
import { settleGithubQuestion } from './settled.js';
import { updateGithubQuestion } from './updated.js';

export const githubQuestions: PieceChannelQuestions<GithubClient> = {
  render: renderGithubQuestion,
  parse: parseGithubQuestion,
  settled: settleGithubQuestion,
  updated: updateGithubQuestion,
  rejected: rejectGithubQuestion,
  denied: denyGithubQuestion,
  stale: staleGithubQuestion,
};
