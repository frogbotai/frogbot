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
 * email from your Okta org's directory is trusted.
 */
export function createOkta({ label = 'Okta', ...options }: OktaOptions) {
  return defineOidc({ piece: 'okta', label, trustEmail: true, ...options });
}
