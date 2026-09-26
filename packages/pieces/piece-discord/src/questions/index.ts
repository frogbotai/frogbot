import type { PieceChannelQuestions } from 'frogbot/pieces';

import type { DiscordClient } from '../client.js';
import { denyDiscordQuestion, rejectDiscordQuestion } from './notify.js';
import { parseDiscordQuestion } from './parse.js';
import { renderDiscordQuestion } from './render.js';
import { settleDiscordQuestion } from './settled.js';
import { updateDiscordQuestion } from './updated.js';

export const discordQuestions: PieceChannelQuestions<DiscordClient> = {
  render: renderDiscordQuestion,
  parse: parseDiscordQuestion,
  settled: settleDiscordQuestion,
  updated: updateDiscordQuestion,
  rejected: rejectDiscordQuestion,
  denied: denyDiscordQuestion,
};
