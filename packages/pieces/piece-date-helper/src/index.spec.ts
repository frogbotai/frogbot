import { pieceContract } from 'frogbot/pieces/test';
import { describe, expect, it } from 'vitest';

import { createDateHelper, dateHelperActions } from './index.js';

const dateHelper = createDateHelper();

pieceContract({ piece: dateHelper, service: 'date_helper', credentialType: 'none', actions: dateHelperActions });
describe('date helper execution', () => { it('gets the current year', async () => { const tool = dateHelper.getCurrentDate; const value = await tool.execute({ timeFormat: 'YYYY', timeZone: 'UTC' }, {} as never); expect(value).toEqual({ result: String(new Date().getUTCFullYear()) }); }); });
