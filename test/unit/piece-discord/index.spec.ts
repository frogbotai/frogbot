import * as module from '@activepieces/piece-discord';
import { pieceContract } from 'frogbot/pieces/test';

import { credentialExecution } from '../../../packages/pieces/credential-execution.js';
import { createDiscord, discordActions } from '../../../packages/pieces/piece-discord/src/index.js';

const discord = createDiscord();
pieceContract({
  piece: discord,
  service: 'discord',
  credentialType: 'secret_text',
  actions: discordActions,
});
credentialExecution({
  module,
  piece: discord,
  service: 'discord',
  credential: { type: 'SECRET_TEXT', secret_text: 'discord_test_key' },
});
