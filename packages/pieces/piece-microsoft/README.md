# `@frogbotai/piece-microsoft`

Shared Microsoft sign-in setup for FrogBot's Microsoft pieces: clouds, tenant settings, identity scopes and the `/me` account lookup.

## Usage

Product pieces spread the recipe into their own `oauth`, as the Google pieces spread `googleOAuth`:

```ts
import { microsoftEnvironment, microsoftOAuth, microsoftScopes } from '@frogbotai/piece-microsoft';

const settings = microsoftEnvironment.parse({
  cloud: 'usGovernment',
  tenantId: 'contoso.onmicrosoft.com',
});
const recipe = microsoftOAuth(settings);

const oauth = {
  ...recipe,
  scopes: {
    catalog: { ...microsoftScopes, 'Mail.Send': 'Mail.Send' },
    defaults: ['Mail.Send'],
    required: recipe.scopes.required,
  },
};
```

- `microsoftClouds` holds the sign-in host and Graph URL for `commercial` and `usGovernment`.
- `microsoftEnvironment` parses `{ cloud, tenantId }`, defaulting to `commercial` and `common`.
- `microsoftOAuth(environment)` returns the authorize and token URLs for that cloud and tenant, always requests `offline_access` and `User.Read`, asks the user to pick an account, and looks the account up at `<graph>/v1.0/me` (mail, else user principal name).
- `microsoftCloud(loginHost)` finds the cloud for a stored credential.

The package has no actions and no `create…` factory; `@frogbotai/piece-microsoft-teams` and `@frogbotai/piece-microsoft-outlook` use it.
