import { pieceContract } from 'frogbot/pieces/test';
import { describe, expect, it } from 'vitest';
import { createXml, xmlActions } from './index.js';

const xml = createXml();

pieceContract({ piece: xml, service: 'xml', credentialType: 'none', actions: xmlActions });
describe('xml execution', () => { it('converts JSON to XML', async () => { const [tool] = xml.tools(); await expect(tool.execute({ json: { frog: 'bot' } }, {} as never)).resolves.toContain('<frog>bot</frog>'); }); });
