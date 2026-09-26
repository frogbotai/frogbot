import type { PieceChannelQuestions } from 'frogbot/pieces';

import type { Linear } from '../client.js';
import { denyLinearQuestion, rejectLinearQuestion, staleLinearQuestion } from './notify.js';
import { parseLinearQuestion } from './parse.js';
import { renderLinearQuestion } from './render.js';
import { settleLinearQuestion } from './settled.js';
import { supportsLinearQuestion } from './supports.js';

export const linearQuestions: PieceChannelQuestions<Linear> = {
  supports: supportsLinearQuestion,
  render: renderLinearQuestion,
  parse: parseLinearQuestion,
  settled: settleLinearQuestion,
  rejected: rejectLinearQuestion,
  denied: denyLinearQuestion,
  stale: staleLinearQuestion,
};
