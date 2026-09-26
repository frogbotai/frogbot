import type { PieceChannelQuestions } from 'frogbot/pieces';

export const supportsTelegramQuestion: NonNullable<PieceChannelQuestions['supports']> = ({
  thread,
}) => !thread.id.startsWith('telegram:biz:');
