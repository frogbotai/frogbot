import type { OAuthProvider } from "../types.js";
import {
  authorizationUrl,
  jsonRequest,
  type OAuthProviderOptions,
  tokenRequest,
} from "./shared.js";

export function githubProvider(options: OAuthProviderOptions): OAuthProvider {
  const request = options.fetch ?? fetch;
  const scopes = options.scopes ?? [
    "admin:repo_hook",
    "admin:org",
    "repo",
    "gist",
  ];
  return {
    id: "github",
    service: "github",
    authorizationUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes,
    authorize: (context) =>
      authorizationUrl({
        url: "https://github.com/login/oauth/authorize",
        clientId: options.clientId,
        scopes,
        context,
      }),
    exchange: async ({ code, callbackUrl, codeVerifier }) =>
      (
        await tokenRequest({
          fetch: request,
          url: "https://github.com/login/oauth/access_token",
          headers: { Accept: "application/json" },
          body: {
            code,
            redirect_uri: callbackUrl,
            code_verifier: codeVerifier,
            client_id: options.clientId,
            client_secret: options.clientSecret,
          },
        })
      ).tokens,
    getAccount: async ({ tokens }) => {
      const value = await jsonRequest({
        fetch: request,
        url: "https://api.github.com/user",
        accessToken: tokens.accessToken,
      });
      return {
        id: String(value.id),
        email: typeof value.email === "string" ? value.email : undefined,
        name:
          typeof value.name === "string"
            ? value.name
            : typeof value.login === "string"
              ? value.login
              : undefined,
        metadata: value,
      };
    },
    refresh: async ({ tokens }) =>
      (
        await tokenRequest({
          fetch: request,
          url: "https://github.com/login/oauth/access_token",
          headers: { Accept: "application/json" },
          body: {
            grant_type: "refresh_token",
            refresh_token: tokens.refreshToken,
            client_id: options.clientId,
            client_secret: options.clientSecret,
          },
        })
      ).tokens,
    revoke: async ({ tokens }) => {
      const response = await request(
        `https://api.github.com/applications/${options.clientId}/token`,
        {
          method: "DELETE",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Basic ${Buffer.from(`${options.clientId}:${options.clientSecret}`).toString("base64")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ access_token: tokens.accessToken }),
        },
      );
      if (!response.ok) throw new Error("OAuth revocation failed.");
    },
  };
}
