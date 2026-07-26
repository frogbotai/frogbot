import { pieceContract } from 'frogbot/pieces/test';

import { createTextHelper, textHelperActions } from './index.js';

const textHelper = createTextHelper();

pieceContract({ piece: textHelper, service: 'text_helper', credentialType: 'none', actions: textHelperActions });
