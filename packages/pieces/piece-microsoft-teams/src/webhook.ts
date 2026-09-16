import { parseTeamsWebhookBody } from '@chat-adapter/teams/webhook';
import type { PieceWebhook } from 'frogbot/pieces';
import type { z } from 'zod';

import type { microsoftTeamsOptions } from './config.js';

export function microsoftTeamsWebhookEvent(data: unknown) {
  const payload = parseTeamsWebhookBody(data);

  switch (payload.kind) {
    case 'message':
      return 'messageReceived';
    case 'message_reaction':
      return 'messageReactionReceived';
    case 'card_action':
      return 'cardActionReceived';
    case 'conversation_update':
      return 'conversationUpdated';
    case 'installation_update':
      return 'installationUpdated';
    case 'dialog_open':
      return 'dialogOpened';
    case 'dialog_submit':
      return 'dialogSubmitted';
    default:
      return 'unsupportedActivityReceived';
  }
}

export const microsoftTeamsWebhook = {
  parse({ req }) {
    return { event: microsoftTeamsWebhookEvent(req.data) };
  },
} satisfies PieceWebhook<z.output<typeof microsoftTeamsOptions>>;
