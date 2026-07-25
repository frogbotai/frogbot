import type { OAuthProvider } from "../types.js";
import {
  authorizationUrl,
  jsonRequest,
  type OAuthProviderOptions,
  tokenRequest,
} from "./shared.js";

export function slackProvider(options: OAuthProviderOptions): OAuthProvider {
  const request = options.fetch ?? fetch;
  const scopes = options.scopes ?? [
    "channels:read",
    "channels:manage",
    "channels:history",
    "chat:write",
    "groups:read",
    "groups:write",
    "groups:history",
    "im:read",
    "im:write",
    "im:history",
    "users:read",
    "users:read.email",
    "files:read",
    "files:write",
    "reactions:read",
    "reactions:write",
  ];
  return {
    id: "slack",
    service: "slack",
    authorizationUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    scopes,
    authorize: (context) =>
      authorizationUrl({
        url: "https://slack.com/oauth/v2/authorize",
        clientId: options.clientId,
        scopes,
        context,
      }),
    exchange: async ({ code, callbackUrl }) =>
      (
        await tokenRequest({
          fetch: request,
          url: "https://slack.com/api/oauth.v2.access",
          body: {
            code,
            redirect_uri: callbackUrl,
            client_id: options.clientId,
            client_secret: options.clientSecret,
          },
        })
      ).tokens,
    getAccount: async ({ tokens }) => {
      const value = await jsonRequest({
        fetch: request,
        url: "https://slack.com/api/auth.test",
        accessToken: tokens.accessToken,
      });
      return {
        id: String(value.team_id),
        name: typeof value.team === "string" ? value.team : undefined,
        metadata: value,
      };
    },
    refresh: async ({ tokens }) =>
      (
        await tokenRequest({
          fetch: request,
          url: "https://slack.com/api/oauth.v2.access",
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
        `https://slack.com/api/auth.revoke?token=${encodeURIComponent(tokens.accessToken)}`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error("OAuth revocation failed.");
    },
  };
}
