import { describe, expectTypeOf, it } from 'vitest';

import type { SettingsEntry } from '../../../../packages/frogbot/src/admin/types.js';
import type { FrogBotConfig } from '../../../../packages/frogbot/src/config/types.js';
import type { FrogBotRequest } from '../../../../packages/frogbot/src/types/request.js';

describe('FrogBotConfig', () => {
  it('uses FrogBotRequest for root afterError hooks', () => {
    type Hooks = NonNullable<FrogBotConfig['hooks']>;
    type Hook = NonNullable<Hooks['afterError']>[number];
    type Request = Parameters<Hook>[0]['req'];

    expectTypeOf<Request>().toEqualTypeOf<FrogBotRequest>();
    expectTypeOf<'frogbot' extends keyof Request ? true : false>().toEqualTypeOf<true>();
    expectTypeOf<'payload' extends keyof Request ? true : false>().toEqualTypeOf<false>();
  });

  it('accepts settings entries with component, icon, and access references', () => {
    type Entry = NonNullable<FrogBotConfig['settings']>[number];

    expectTypeOf<Entry>().toEqualTypeOf<SettingsEntry>();
    expectTypeOf<NonNullable<Entry['access']>>().parameter(0).toHaveProperty('req');
  });
});
