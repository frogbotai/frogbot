import { pieceContract } from 'frogbot/pieces/test';
import { describe, expect, it } from 'vitest';
import { createCrypto, cryptoActions } from './index.js';

const crypto = createCrypto();

pieceContract({ piece: crypto, service: 'crypto', credentialType: 'none', actions: cryptoActions });
describe('crypto execution', () => { it('encodes base64', async () => { const tool = crypto.base64Encode; await expect(tool.execute({ text: 'FrogBot' }, {} as never)).resolves.toBe('RnJvZ0JvdA=='); }); });
