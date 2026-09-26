import type { PieceChannelQuestions } from 'frogbot/pieces';

import { agentSessionId } from './linearThread.js';

export const supportsLinearQuestion: NonNullable<PieceChannelQuestions['supports']> = ({
  thread,
}) => agentSessionId(thread.id) !== undefined;
