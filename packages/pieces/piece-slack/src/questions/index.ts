import type { PieceChannelQuestions } from 'frogbot/pieces';

import type { SlackClient } from '../client.js';
import { denySlackQuestion, rejectSlackQuestion, staleSlackQuestion } from './notify.js';
import { parseSlackQuestion } from './parse.js';
import { renderSlackQuestion } from './render.js';
import { settleSlackQuestion } from './settled.js';
import { updateSlackQuestion } from './updated.js';

export const slackQuestions: PieceChannelQuestions<SlackClient> = {
  render: renderSlackQuestion,
  parse: parseSlackQuestion,
  settled: settleSlackQuestion,
  updated: updateSlackQuestion,
  rejected: rejectSlackQuestion,
  denied: denySlackQuestion,
  stale: staleSlackQuestion,
};
