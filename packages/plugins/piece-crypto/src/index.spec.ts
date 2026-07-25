import { pieceContract } from 'frogbot/pieces/test';
import { describe, expect, it } from 'vitest';
import { crypto, cryptoActions } from './index.js';

pieceContract({ piece: crypto, service: 'crypto', credentialType: 'none', actions: cryptoActions });
describe('crypto execution', () => { it('encodes base64', async () => { const [tool] = crypto.tools({ actions: ['base64-encode'] }); await expect(tool.execute({ text: 'FrogBot' }, {} as never)).resolves.toBe('RnJvZ0JvdA=='); }); });
