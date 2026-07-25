import { pieceContract } from 'frogbot/pieces/test';
import { describe, expect, it } from 'vitest';
import { dateHelper, dateHelperActions } from './index.js';

pieceContract({ piece: dateHelper, service: 'date_helper', credentialType: 'none', actions: dateHelperActions });
describe('date helper execution', () => { it('gets the current year', async () => { const [tool] = dateHelper.tools({ actions: ['get_current_date'] }); const value = await tool.execute({ timeFormat: 'YYYY', timeZone: 'UTC' }, {} as never); expect(value).toEqual({ result: String(new Date().getUTCFullYear()) }); }); });
