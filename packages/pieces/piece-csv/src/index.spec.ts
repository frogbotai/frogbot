import { pieceContract } from 'frogbot/pieces/test';
import { describe, expect, it } from 'vitest';

import { createCsv, csvActions } from './index.js';

const csv = createCsv();

pieceContract({ piece: csv, service: 'csv', credentialType: 'none', actions: csvActions });
describe('csv execution', () => { it('converts JSON to CSV', async () => { const tool = csv.convertJsonToCsv; await expect(tool.execute({ json_array: [{ name: 'FrogBot' }], delimiter_type: ',' }, {} as never)).resolves.toContain('FrogBot'); }); });
