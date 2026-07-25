import * as module from '@activepieces/piece-discord';
import { pieceContract } from 'frogbot/pieces/test';
import { credentialExecution } from '../../credential-execution.js';
import { discord, discordActions } from './index.js';
pieceContract({ piece: discord, service: 'discord', credentialType: 'secret_text', actions: discordActions });
credentialExecution({ module, piece: discord, service: 'discord', credential: 'discord_test_key' });
