import type { RoleSlug } from '@frogbotai/plugin-roles';
import { expectTypeOf } from 'vitest';

expectTypeOf<RoleSlug>().toEqualTypeOf<string>();
