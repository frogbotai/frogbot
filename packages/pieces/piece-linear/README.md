# `@frogbotai/piece-linear`

Manage Linear issues, projects, comments, webhook events, and Agent Session conversations.

## Usage

```ts
import { createLinear } from '@frogbotai/piece-linear';

export const linear = createLinear({ auth: { apiKey: process.env.LINEAR_API_KEY! } });
```

API keys and OAuth access tokens use FrogBot's current connection resolution. OAuth application
credentials configure the connection flow; the resulting access token is the piece credential.

Enable the credential form with `connections: [{ piece: linear, secret: true }]`. Enter either
`apiKey` or `accessToken` and omit the unused field. A user-linked credential takes precedence over
factory auth for that user's action calls; channels continue using the fixed factory credential.

OAuth linking requires factory `oauth: { clientId, clientSecret }` and
`connections: [{ piece: linear, oauth: true }]`. The built-in recipe requests `actor=app`: a workspace
admin installs the application, and actions use the app's identity. It does not authorize actions
as the installing user. For actions as a person, link their API key or an externally obtained
user-actor OAuth access token through the credential form. Scope overrides remain an array of
individual scopes in `oauth.scopes`; FrogBot serializes them with commas for Linear.

## Channel setup

Agent Sessions are the primary channel mode. Create a Linear OAuth application under **Settings >
API > Applications**, enable Agent Session webhook events, and have a workspace admin install it
as an app actor with `read`, `write`, `comments:create`, `issues:create`, and `app:mentionable` scopes.

Set the OAuth application's webhook URL to this instance URL:

```text
https://<host>/api/webhooks/<piece-instance-slug>
```

Select **Agent session events** and copy the application's webhook signing secret. Configure the
installed OAuth access token and webhook secret:

```ts
export const linear = createLinear({
  auth: { accessToken: process.env.LINEAR_ACCESS_TOKEN! },
  webhookSecret: process.env.LINEAR_WEBHOOK_SECRET!,
  botUsername: 'FrogBot',
});
```

Authorization-code OAuth access tokens expire after 24 hours. The channel adapter captures the
static `auth.accessToken` and does not use FrogBot's user-connection refresh flow. Renew it through
[Linear's refresh-token endpoint](https://linear.app/developers/oauth-2-0-authentication#refresh-an-access-token),
retain the replacement refresh token, update the configured access token, and restart the FrogBot
runtime before expiry. Pasting an OAuth token into a secret connection also stores a static token;
it does not enable automatic renewal.

For a personal API key bot that responds to issue comments, set `channelMode: 'comments'`, subscribe
an admin-created workspace webhook to **Comments**, and set `botUsername` to the name users mention.
Comment mode supports post-and-edit streaming, but not Agent Session thoughts or native activity streaming.

Linear signs the exact request body in `Linear-Signature` with HMAC-SHA256. FrogBot rejects missing,
invalid, or stale signed deliveries before channel or trigger dispatch. Channel replies are handled
by the adapter; the triggers below remain independent per-subscription workflows.

## Actions

| Upstream action slug    | Previous wrapper export | Native action     | Notes                                                |
| ----------------------- | ----------------------- | ----------------- | ---------------------------------------------------- |
| `linear_create_issue`   | `linearCreateIssue`     | `createIssue`     |                                                      |
| `linear_update_issue`   | `linearUpdateIssue`     | `updateIssue`     |                                                      |
| `linear_create_project` | `linearCreateProject`   | `createProject`   |                                                      |
| `linear_update_project` | `linearUpdateProject`   | `updateProject`   | Previously exposed but omitted from `linearActions`. |
| `linear_create_comment` | `linearCreateComment`   | `createComment`   |                                                      |
| `rawGraphqlQuery`       | `rawGraphqlQuery`       | `rawGraphqlQuery` |                                                      |

## Triggers

Set the factory's optional `webhookSecret` to enable webhook triggers. Actions continue to work
without it; trigger subscription creation requires it. Each trigger registers its supplied
`/api/webhooks/<piece-instance-slug>/<subscription-id>` URL and does not send channel
replies.

The lifecycle creates and reads webhooks through Linear's API, which requires a workspace admin's
API key or a user-actor OAuth token with `admin` scope. Linear's `actor=app` tokens cannot request
`admin`, so the built-in OAuth recipe and Agent Session channel token cannot provision these
subscriptions. Use a separately named piece instance with an admin API key for triggers when the
channel uses app-actor OAuth; supply that instance's own webhook secret and subscription URLs.
See [Linear's webhook permissions](https://linear.app/developers/webhooks) and
[app-actor restrictions](https://linear.app/developers/agents#admin).

```ts
export const linearWebhooks = createLinear({
  slug: 'linear-webhooks',
  auth: { apiKey: process.env.LINEAR_ADMIN_API_KEY! },
  webhookSecret: process.env.LINEAR_WEBHOOK_SECRET!,
});
```

FrogBot passes this secret to Linear when creating each webhook. Incoming requests must have a valid
`Linear-Signature` HMAC-SHA256 signature over the raw body and a current signed body
`webhookTimestamp`. Missing or invalid signatures, secrets, or timestamps are rejected.

| Upstream trigger slug | Native trigger   | Type      | Notes                                                 |
| --------------------- | ---------------- | --------- | ----------------------------------------------------- |
| `new_comment`         | `commentCreated` | `webhook` | Optional team and author filters.                     |
| `new_issue`           | `issueCreated`   | `webhook` | Team-scoped.                                          |
| `updated_issue`       | `issueUpdated`   | `webhook` | Optional team scope.                                  |
| `removed_issue`       | `issueRemoved`   | `webhook` | Team-scoped.                                          |
| `new_project`         | `projectCreated` | `webhook` | Workspace-wide.                                       |
| `updated_project`     | `projectUpdated` | `webhook` | Status changes with optional team and status filters. |
| `removed_project`     | `projectRemoved` | `webhook` | Workspace-wide.                                       |
