import type { OAuthProvider } from "../types.js";
import {
  authorizationUrl,
  basicCredentials,
  jsonRequest,
  type OAuthProviderOptions,
  tokenRequest,
} from "./shared.js";

export function notionProvider(options: OAuthProviderOptions): OAuthProvider {
  const request = options.fetch ?? fetch;
  const scopes = options.scopes ?? [];
  const headers = {
    Authorization: basicCredentials(options.clientId, options.clientSecret),
  };
  return {
    id: "notion",
    service: "notion",
    authorizationUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    scopes,
    authorize: (context) =>
      authorizationUrl({
        url: "https://api.notion.com/v1/oauth/authorize",
        clientId: options.clientId,
        scopes,
        context,
        params: { owner: "user" },
      }),
    exchange: async ({ code, callbackUrl }) =>
      (
        await tokenRequest({
          fetch: request,
          url: "https://api.notion.com/v1/oauth/token",
          headers,
          body: {
            grant_type: "authorization_code",
            code,
            redirect_uri: callbackUrl,
          },
        })
      ).tokens,
    getAccount: async ({ tokens }) => {
      const value = await jsonRequest({
        fetch: request,
        url: "https://api.notion.com/v1/users/me",
        accessToken: tokens.accessToken,
      });
      return {
        id: String(value.id),
        name: typeof value.name === "string" ? value.name : undefined,
        metadata: value,
      };
    },
    refresh: async ({ tokens }) =>
      (
        await tokenRequest({
          fetch: request,
          url: "https://api.notion.com/v1/oauth/token",
          headers,
          body: {
            grant_type: "refresh_token",
            refresh_token: tokens.refreshToken,
          },
        })
      ).tokens,
    revoke: async ({ tokens }) => {
      const response = await request("https://api.notion.com/v1/oauth/revoke", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokens.accessToken }),
      });
      if (!response.ok) throw new Error("OAuth revocation failed.");
    },
  };
}
