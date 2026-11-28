import { defineOidc, type OidcOptions } from '@frogbotai/piece-oidc';

/** Options for Okta sign-in. */
export type OktaOptions = Omit<OidcOptions, 'issuer' | 'trustEmail' | 'label'> & {
  /**
   * The Okta authorization server's issuer: `https://acme.okta.com` for the org server, or
   * `https://acme.okta.com/oauth2/default` for a custom one.
   */
  issuer: string;
  /** The button text after "Continue with". Defaults to `Okta`. */
  label?: string;
};

/**
 * A "Continue with Okta" sign-in method. Okta doesn't reliably send `email_verified`, so the
 * email from your Okta org's directory is trusted when the claim is missing. An email Okta marks
 * unverified is refused.
 */
export function createOkta({ label = 'Okta', issuer, ...options }: OktaOptions) {
  return defineOidc({
    piece: 'okta',
    label,
    issuer: typeof issuer === 'string' ? issuer.replace(/\/+$/, '') : issuer,
    trustEmail: true,
    ...options,
  });
}
