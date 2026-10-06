import { expectTypeOf } from 'vitest';

import type { FrogBotConfig, OnInit } from '../../../../packages/frogbot/src/config/types.js';
import type { FrogBot } from '../../../../packages/frogbot/src/frogbot.js';

expectTypeOf<OnInit>().parameter(0).toEqualTypeOf<FrogBot>();
expectTypeOf<OnInit>().toMatchTypeOf<NonNullable<FrogBotConfig['onInit']>>();
expectTypeOf<OnInit[]>().toMatchTypeOf<NonNullable<FrogBotConfig['onInit']>>();
