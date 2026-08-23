import { describe, expectTypeOf, it } from 'vitest';

import type { FrogbotConfig } from './config.js';
import type { FrogbotRequest } from './request.js';
import type { SettingsEntry } from './settings.js';

describe('FrogbotConfig', () => {
  it('uses FrogbotRequest for root afterError hooks', () => {
    type Hooks = NonNullable<FrogbotConfig['hooks']>;
    type Hook = NonNullable<Hooks['afterError']>[number];
    type Request = Parameters<Hook>[0]['req'];

    expectTypeOf<Request>().toEqualTypeOf<FrogbotRequest>();
    expectTypeOf<'frogbot' extends keyof Request ? true : false>().toEqualTypeOf<true>();
    expectTypeOf<'payload' extends keyof Request ? true : false>().toEqualTypeOf<false>();
  });

  it('accepts settings entries with component, icon, and access references', () => {
    type Entry = NonNullable<FrogbotConfig['settings']>[number];

    expectTypeOf<Entry>().toEqualTypeOf<SettingsEntry>();
    expectTypeOf<NonNullable<Entry['access']>>().parameter(0).toHaveProperty('req');
  });
});
