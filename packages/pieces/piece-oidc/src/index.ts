import {
  definePiece,
  discoverOidc,
  type PieceOAuthAccount,
  type PieceOAuthRecipe,
} from 'frogbot/pieces';
import { z } from 'zod';

/** Options for an OpenID Connect sign-in method. */
export type OidcOptions = {
  /** The provider's issuer URL, exactly as its discovery document names it. */
  issuer: string;
  oauth: { clientId: string; clientSecret: string };
  /** The method's route segment, `/api/<collection>/sign-in/<slug>`. Defaults to `oidc`. */
  slug?: string;
  /** The button text after "Continue with". Defaults to `SSO`. */
  label?: string;
  /**
   * Accept the provider's email without `email_verified: true`. Only for a provider whose
   * directory you control, where people can't set an email they don't own.
   */
  trustEmail?: boolean;
};

export const oidcScopes = { openid: 'openid', email: 'email', profile: 'profile' } as const;

const oidcAuth = z.object({ accessToken: z.string().min(1).meta({ secret: true }) });

const userinfoSchema = z.object({
  sub: z.string().trim().min(1),
  email: z.string().trim().min(1),
  email_verified: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
  name: z.string().optional(),
});

/** Reads the signed-in person from the issuer's userinfo endpoint. */
export async function oidcAccount({
  issuer,
  accessToken,
  trustEmail = false,
  signal,
}: {
  issuer: string;
  accessToken: string | undefined;
  trustEmail?: boolean;
  signal?: AbortSignal;
}): Promise<PieceOAuthAccount & { email: string }> {
  const { userinfo_endpoint: userinfo } = await discoverOidc(issuer);
  if (!userinfo) throw new Error(`${issuer} has no userinfo endpoint.`);
  if (!accessToken) throw new Error(`${issuer} returned no access token.`);

  const response = await fetch(userinfo, {
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
    signal,
  });

  if (!response.ok) throw new Error(`${issuer} account lookup failed.`);
  const account = userinfoSchema.safeParse(await response.json());
  const verified = account.data && String(account.data.email_verified) === 'true';
  if (!account.success || (!trustEmail && !verified)) {
    throw new Error(`${issuer} did not return a verified email address.`);
  }

  const { sub, email, name } = account.data;

  return { id: sub, label: name?.trim() || email, email };
}

/** Builds the sign-in method for a piece slug; `createOidc` and provider presets share it. */
export function defineOidc({
  piece,
  issuer,
  oauth,
  slug,
  label,
  trustEmail,
}: Omit<OidcOptions, 'label'> & { piece: string; label: string }) {
  const recipe = {
    issuer,
    tokenEndpointAuthMethod: 'client_secret_basic',
    pkce: true,
    scopes: { catalog: oidcScopes, defaults: [], required: ['openid', 'email', 'profile'] },
    account: ({ tokens, req }) =>
      oidcAccount({ issuer, accessToken: tokens.access_token, trustEmail, signal: req.signal }),
  } satisfies PieceOAuthRecipe<unknown, unknown, PieceOAuthAccount, keyof typeof oidcScopes>;

  const create = definePiece({
    slug: piece,
    label,
    auth: oidcAuth,
    client: ({ auth }: { auth: unknown }) => oidcAuth.parse(auth),
    oauth: recipe,
    actions: [],
  });

  return create({ oauth, ...(slug ? { slug } : {}) });
}

/** A "Continue with SSO" sign-in method for any OpenID Connect provider. */
export function createOidc({ label = 'SSO', ...options }: OidcOptions) {
  return defineOidc({ piece: 'oidc', label, ...options });
}
