import type { PieceOAuthAccount, PieceOAuthRecipe } from 'frogbot/pieces';
import { z } from 'zod';

export const microsoftClouds = {
  commercial: {
    loginHost: 'login.microsoftonline.com',
    graphUrl: 'https://graph.microsoft.com',
  },
  usGovernment: {
    loginHost: 'login.microsoftonline.us',
    graphUrl: 'https://graph.microsoft.us',
  },
} as const;

export type MicrosoftCloud = (typeof microsoftClouds)[keyof typeof microsoftClouds];

export const microsoftEnvironment = z.object({
  cloud: z.enum(['commercial', 'usGovernment']).default('commercial'),
  tenantId: z.string().trim().min(1).default('common'),
});

export type MicrosoftEnvironment = z.input<typeof microsoftEnvironment>;

export const microsoftScopes = {
  openid: 'openid',
  email: 'email',
  profile: 'profile',
  offline_access: 'offline_access',
  'User.Read': 'User.Read',
} as const;

const me = z.object({
  id: z.string(),
  displayName: z.string().nullish(),
  mail: z.string().nullish(),
  userPrincipalName: z.string().nullish(),
});

/** The cloud for a stored credential's sign-in host. */
export function microsoftCloud(loginHost: string): MicrosoftCloud {
  const cloud = Object.values(microsoftClouds).find((value) => value.loginHost === loginHost);

  if (!cloud) throw new Error('Microsoft cloud environment is unsupported.');

  return cloud;
}

/** Sign-in URLs, identity scopes and `/me` account lookup for one Microsoft cloud and tenant. */
export function microsoftOAuth(environment?: MicrosoftEnvironment) {
  const settings = microsoftEnvironment.parse(environment ?? {});
  const cloud = microsoftClouds[settings.cloud];
  const tenant = encodeURIComponent(settings.tenantId);

  return {
    authorizationUrl: `https://${cloud.loginHost}/${tenant}/oauth2/v2.0/authorize`,
    tokenUrl: `https://${cloud.loginHost}/${tenant}/oauth2/v2.0/token`,
    scopes: {
      catalog: microsoftScopes,
      defaults: [],
      required: ['offline_access', 'User.Read'],
    },
    params: { prompt: 'select_account' },
    async account({ tokens, req }) {
      const response = await fetch(`${cloud.graphUrl}/v1.0/me`, {
        headers: { authorization: `Bearer ${tokens.access_token ?? ''}` },
        redirect: 'error',
        signal: req.signal ?? undefined,
      });

      if (!response.ok) throw new Error(`Microsoft account lookup failed (${response.status}).`);

      const account = me.parse(await response.json());
      const email = account.mail ?? account.userPrincipalName;

      if (!email) throw new Error('Microsoft did not return an account email address.');

      return { id: account.id, label: account.displayName ?? email, email };
    },
  } satisfies PieceOAuthRecipe<unknown, unknown, PieceOAuthAccount, keyof typeof microsoftScopes>;
}
