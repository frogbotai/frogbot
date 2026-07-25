import { pieceContract } from 'frogbot/pieces/test';

import { textHelper, textHelperActions } from './index.js';

pieceContract({ piece: textHelper, service: 'text_helper', credentialType: 'none', actions: textHelperActions });
