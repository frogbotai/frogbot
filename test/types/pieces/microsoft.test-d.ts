import {
  type MicrosoftCloud,
  type MicrosoftEnvironment,
  microsoftEnvironment,
  microsoftOAuth,
  type microsoftScopes,
} from '@frogbotai/piece-microsoft';
import { expectTypeOf } from 'vitest';

expectTypeOf<MicrosoftEnvironment>().toEqualTypeOf<{
  cloud?: 'commercial' | 'usGovernment' | undefined;
  tenantId?: string | undefined;
}>();

expectTypeOf(microsoftEnvironment.parse({})).toEqualTypeOf<{
  cloud: 'commercial' | 'usGovernment';
  tenantId: string;
}>();

expectTypeOf<MicrosoftCloud['graphUrl']>().toEqualTypeOf<
  'https://graph.microsoft.com' | 'https://graph.microsoft.us'
>();

const recipe = microsoftOAuth({ cloud: 'usGovernment' });

expectTypeOf(recipe.authorizationUrl).toEqualTypeOf<string>();
expectTypeOf(recipe.scopes.catalog).toEqualTypeOf<typeof microsoftScopes>();

expectTypeOf<Awaited<ReturnType<typeof recipe.account>>>().toEqualTypeOf<{
  id: string;
  label: string;
  email: string;
}>();

// @ts-expect-error only the commercial and US Government clouds exist
microsoftOAuth({ cloud: 'china' });
