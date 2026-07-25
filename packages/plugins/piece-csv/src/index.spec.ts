import { pieceContract } from 'frogbot/pieces/test';
import { describe, expect, it } from 'vitest';
import { csv, csvActions } from './index.js';

pieceContract({ piece: csv, service: 'csv', credentialType: 'none', actions: csvActions });
describe('csv execution', () => { it('converts JSON to CSV', async () => { const [tool] = csv.tools({ actions: ['convert_json_to_csv'] }); await expect(tool.execute({ json_array: [{ name: 'FrogBot' }], delimiter_type: ',' }, {} as never)).resolves.toContain('FrogBot'); }); });
