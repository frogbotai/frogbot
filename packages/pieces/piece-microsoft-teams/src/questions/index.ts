import type { PieceChannelQuestions } from 'frogbot/pieces';

import type { MicrosoftTeamsClient } from '../client.js';
import { denyTeamsQuestion, staleTeamsQuestion } from './notify.js';
import { parseTeamsQuestion } from './parse.js';
import { rejectTeamsQuestion } from './rejected.js';
import { renderTeamsQuestion } from './render.js';
import { settleTeamsQuestion } from './settled.js';

export const teamsQuestions: PieceChannelQuestions<MicrosoftTeamsClient> = {
  render: renderTeamsQuestion,
  parse: parseTeamsQuestion,
  settled: settleTeamsQuestion,
  rejected: rejectTeamsQuestion,
  denied: denyTeamsQuestion,
  stale: staleTeamsQuestion,
};
