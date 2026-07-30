import type { Logger as PinoLogger } from 'pino';
import { expectTypeOf } from 'vitest';

import type { Logger } from '../frogbot.js';

expectTypeOf<Logger['info']>().toBeCallableWith({ provider: 'openai' }, 'request-start');
expectTypeOf<Logger['info']>().toBeCallableWith('request-start');
expectTypeOf<PinoLogger>().toMatchTypeOf<Logger>();
