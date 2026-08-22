import { expectTypeOf } from 'vitest';

import type { CollectionConfig, IconName } from '../index.js';

expectTypeOf<'robot'>().toMatchTypeOf<IconName>();
expectTypeOf<null>().toMatchTypeOf<NonNullable<CollectionConfig['admin']>['group']>();
expectTypeOf<'./Icon#Icon'>().toMatchTypeOf<NonNullable<CollectionConfig['admin']>['icon']>();
