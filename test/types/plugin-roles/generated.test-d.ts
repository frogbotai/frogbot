import type { RoleSlug } from '@frogbotai/plugin-roles';
import { expectTypeOf } from 'vitest';

interface Config {
  roles: 'admin' | 'member';
}

declare module 'frogbot' {
  interface GeneratedTypes extends Config {} // eslint-disable-line @typescript-eslint/no-empty-object-type -- mirrors the generated augmentation
}

expectTypeOf<RoleSlug>().toEqualTypeOf<'admin' | 'member'>();
