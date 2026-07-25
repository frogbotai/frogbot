import * as module from '@activepieces/piece-discord';
import { createActivepiecesPiece } from 'frogbot/pieces';

export const discordActions = ['sendMessageWithBot', 'send_message_webhook', 'add_role_to_member', 'remove_role_from_member', 'list_guild_members', 'find_channel'] as const;
export const discord = createActivepiecesPiece({ module, service: 'discord', credentialType: 'secret_text', defaultActions: discordActions });
