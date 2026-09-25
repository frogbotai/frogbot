import { expectTypeOf } from 'vitest';

import type { FrogBot } from '../frogbot.js';
import type { FrogBotConfig, OnInit } from './types.js';

expectTypeOf<OnInit>().parameter(0).toEqualTypeOf<FrogBot>();
expectTypeOf<OnInit>().toMatchTypeOf<NonNullable<FrogBotConfig['onInit']>>();
expectTypeOf<OnInit[]>().toMatchTypeOf<NonNullable<FrogBotConfig['onInit']>>();
