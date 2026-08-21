import { expectTypeOf } from 'vitest';

import type { Frogbot } from '../frogbot.js';
import type { FrogbotConfig, OnInit } from './config.js';

expectTypeOf<OnInit>().parameter(0).toEqualTypeOf<Frogbot>();
expectTypeOf<OnInit>().toMatchTypeOf<NonNullable<FrogbotConfig['onInit']>>();
expectTypeOf<OnInit[]>().toMatchTypeOf<NonNullable<FrogbotConfig['onInit']>>();
