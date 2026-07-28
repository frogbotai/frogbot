# FrogBot Example: Business QA

A comprehensive release-readiness assistant built as the second tier beside the minimal [`examples/simple`](../simple) onboarding example. It demonstrates authenticated agents, explicit piece action selection, uploads, an application collection, adopted connection storage, inbound API keys, and outbound OAuth and secret credentials without requiring external infrastructure for FrogBot itself.

## What it includes

- SQLite, normal email/password users, the Next.js admin panel, and generated types
- `releases`, authenticated `media` uploads, and an extended `connections` collection
- A read-oriented `qa-analyst` and a write-oriented `release-manager`
- Google Sheets, Drive, Calendar, Linear, Resend, date helper, data summarizer, and PDF pieces
- One Google OAuth consent with scopes derived from all registered Google pieces
- Named inbound API keys and owner-scoped outbound credentials
- JSON, SSE, and persisted authenticated thread continuation

## Prerequisites

- Node.js 20 or newer and pnpm
- An OpenAI API key to invoke either agent
- Optional, real provider credentials for the integrations you want to test

SQLite and local uploads need no Docker or cloud account.

## Setup

From this directory:

```bash
pnpm install
cp .env.example .env
```

Set `OPENAI_API_KEY` and replace `FROGBOT_SECRET` in `.env`, then start the app:

```bash
pnpm dev
```

Open:

- App: <http://localhost:3000>
- Admin: <http://localhost:3000/admin>
- REST API: <http://localhost:3000/api>
- Agent catalog: <http://localhost:3000/api/agents>

The first visit to the admin panel creates the first user. No sample data is seeded; create the release below in the admin panel so the setup remains explicit and repeatable.

## Sample release

Create a `releases` record with:

| Field               | Example                                                                    |
| ------------------- | -------------------------------------------------------------------------- |
| Name                | Summer launch                                                              |
| Version             | 1.4.0                                                                      |
| Status              | QA                                                                         |
| Target date         | A future date                                                              |
| Owner               | Your user                                                                  |
| Summary             | Ship the release-readiness workflow to the pilot team.                     |
| Acceptance criteria | Critical Linear issues closed; QA sheet complete; launch review scheduled. |

Upload a test plan or PDF in `media` and attach it under `artifacts`. Piece-produced files use the same core files collection.

## Authenticate

Log in through the admin panel, or obtain a JWT with email and password:

```bash
export FROGBOT_TOKEN=$(curl -s http://localhost:3000/api/users/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"your-password"}' | jq -r .token)
```

All agent and connection operations in this example require an authenticated user.

## Create an API key

Open `Security > API Keys` in the admin panel, create a named key such as `local-qa`, and copy the displayed plaintext token immediately. It cannot be retrieved later.

```bash
export FROGBOT_API_KEY='fbt_replace_me'
```

Use it as `Authorization: Bearer $FROGBOT_API_KEY` or `X-API-Key: $FROGBOT_API_KEY`. The key authenticates as its owner; it is for inbound FrogBot requests and is separate from outbound provider connections.

## Connect Google

This section requires real Google OAuth credentials. Create a Web application OAuth client, enable the Sheets, Drive, and Calendar APIs, and set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`.

Register this callback URL:

```text
http://localhost:3000/api/users/oauth/google/callback
```

While logged into the admin panel in the same browser, open the authorization URL:

```text
http://localhost:3000/api/users/oauth/google/authorize?returnUrl=/admin
```

The plugin derives one provider from the shared credentials object and unions the scopes declared by Sheets, Drive, and Calendar.

## Connect Linear and Resend

Linear requires a user-owned API key. Resend uses the deployment's `RESEND_API_KEY` and does not require a user connection:

```bash
curl -s http://localhost:3000/api/connections/secret \
  -H "Authorization: Bearer $FROGBOT_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"service":"linear","credentials":{"value":"lin_api_replace_me"},"accountLabel":"QA workspace"}' | jq

```

Credentials are encrypted with a key derived from `FROGBOT_SECRET`. The admin and list APIs never return plaintext credentials.

Check requirements before starting an agent:

```bash
curl -s http://localhost:3000/api/agents/qa-analyst/authorizations \
  -H "Authorization: Bearer $FROGBOT_TOKEN" | jq
```

## Call the agents

The analyst has only read and analysis actions. JSON responses include a `threadId` for authenticated calls:

```bash
curl -s http://localhost:3000/api/agents/qa-analyst \
  -H "Authorization: Bearer $FROGBOT_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Review the QA spreadsheet, launch calendar, and test-plan PDF. Identify release blockers without changing anything."}' | jq
```

Stream the same endpoint with SSE:

```bash
curl -N http://localhost:3000/api/agents/qa-analyst \
  -H "Authorization: Bearer $FROGBOT_API_KEY" \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/event-stream' \
  -d '{"prompt":"Summarize current release evidence."}'
```

The release manager has narrowly selected write actions. Its instructions require confirmation before email, but callers should still grant this agent only to trusted users:

```bash
curl -s http://localhost:3000/api/agents/release-manager \
  -H "Authorization: Bearer $FROGBOT_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Create a Linear issue for the missing rollback test. Do not send email."}' | jq
```

## Continue a thread

Capture the `threadId` from a JSON response and send it with the next prompt:

```bash
export THREAD_ID='replace-with-response-thread-id'

curl -s http://localhost:3000/api/agents/qa-analyst \
  -H "Authorization: Bearer $FROGBOT_API_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"threadId\":\"$THREAD_ID\",\"prompt\":\"Now rank those blockers by launch risk.\"}" | jq
```

Threads are owner-scoped. SSE responses expose the persisted thread ID in the `X-Frogbot-Thread-Id` response header.

## QA checklist

- Create a user and confirm anonymous agent calls return forbidden.
- Create and use a named API key, revoke it, and confirm it no longer authenticates.
- Create the sample release and upload an artifact.
- Connect Google once and confirm the connection covers all three services.
- Add a Linear secret and confirm plaintext values are never readable.
- Confirm the authorization preflight excludes deployment-provided Resend credentials.
- Ask `qa-analyst` to use only read-oriented actions.
- Ask `release-manager` to create one approved Linear item and confirm the mutation.
- Exercise JSON, SSE, and thread continuation.
- Regenerate types and the import map after config or admin component changes.

## Scripts

| Command                   | Purpose                                 |
| ------------------------- | --------------------------------------- |
| `pnpm dev`                | Start local development                 |
| `pnpm build`              | Build the Next.js application           |
| `pnpm start`              | Serve the production build              |
| `pnpm generate:types`     | Regenerate `src/frogbot-types.ts`       |
| `pnpm generate:importmap` | Regenerate the tracked admin import map |
| `pnpm typecheck`          | Type-check the example                  |

## Security and production

- Replace the development secret and persist it securely; changing it makes existing encrypted connections unreadable.
- Use HTTPS callback URLs, secure secret management, durable database and upload storage, backups, and provider-specific least-privilege OAuth clients.
- Review every selected write action and enforce role-aware access before exposing the release manager beyond trusted operators.
- API keys are bearer credentials. Store them once, rotate them, and revoke unused keys.
- Uploaded and generated files are buffered in memory by pieces; set appropriate upload limits and use a production storage adapter.
- The local SQLite file and `media` directory are intentionally ignored and are not a production deployment architecture.
- Google, Linear, Resend, and OpenAI operations are genuine external side effects and can incur cost. Use test accounts and inspect prompts before invoking write tools.
