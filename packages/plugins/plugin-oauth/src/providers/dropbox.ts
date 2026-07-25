import type { OAuthProvider } from "../types.js";
import {
  authorizationUrl,
  basicCredentials,
  jsonRequest,
  type OAuthProviderOptions,
  tokenRequest,
} from "./shared.js";

export function dropboxProvider(options: OAuthProviderOptions): OAuthProvider {
  const request = options.fetch ?? fetch;
  const scopes = options.scopes ?? [
    "files.metadata.write",
    "files.metadata.read",
    "files.content.write",
    "files.content.read",
  ];
  const headers = {
    Authorization: basicCredentials(options.clientId, options.clientSecret),
  };
  return {
    id: "dropbox",
    service: "dropbox",
    authorizationUrl: "https://www.dropbox.com/oauth2/authorize",
    tokenUrl: "https://api.dropboxapi.com/oauth2/token",
    scopes,
    authorize: (context) =>
      authorizationUrl({
        url: "https://www.dropbox.com/oauth2/authorize",
        clientId: options.clientId,
        scopes,
        context,
        params: { token_access_type: "offline" },
      }),
    exchange: async ({ code, callbackUrl, codeVerifier }) =>
      (
        await tokenRequest({
          fetch: request,
          url: "https://api.dropboxapi.com/oauth2/token",
          headers,
          body: {
            grant_type: "authorization_code",
            code,
            redirect_uri: callbackUrl,
            code_verifier: codeVerifier,
          },
        })
      ).tokens,
    getAccount: async ({ tokens }) => {
      const value = await jsonRequest({
        fetch: request,
        url: "https://api.dropboxapi.com/2/users/get_current_account",
        accessToken: tokens.accessToken,
      });
      const name = value.name as Record<string, unknown> | undefined;
      return {
        id: String(value.account_id),
        email: typeof value.email === "string" ? value.email : undefined,
        name:
          typeof name?.display_name === "string"
            ? name.display_name
            : undefined,
        metadata: value,
      };
    },
    refresh: async ({ tokens }) =>
      (
        await tokenRequest({
          fetch: request,
          url: "https://api.dropboxapi.com/oauth2/token",
          headers,
          body: {
            grant_type: "refresh_token",
            refresh_token: tokens.refreshToken,
          },
        })
      ).tokens,
    revoke: async ({ tokens }) => {
      const response = await request(
        "https://api.dropboxapi.com/2/auth/token/revoke",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        },
      );
      if (!response.ok) throw new Error("OAuth revocation failed.");
    },
  };
}
