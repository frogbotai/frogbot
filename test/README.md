# Test Infrastructure

`test/` is its own pnpm workspace package (`frogbot-test-suite`) with
`"type": "module"` set so every config file under `test/<suite>/`
loads as ESM. It mirrors Payload's `test/` layout.

## Quick Start

```bash
# Unit tests (no Docker needed)
pnpm test:unit

# Integration tests with MongoDB (default, needs Docker)
docker compose -f test/docker-compose.yml --profile mongodb up -d
pnpm test:int

# Integration tests with Postgres
docker compose -f test/docker-compose.yml --profile postgres up -d
pnpm test:int:pg

# All services (storage, kv, db)
docker compose -f test/docker-compose.yml --profile all up -d
pnpm test:int
```

## Layout

```
test/
├── __helpers/shared/           # boot harness, REST client, seeders
│   ├── bootFrogbot.ts          # boots a frogbot HTTP server + DB
│   ├── buildTestConfig.ts      # shared config builder (db, secret, defaults)
│   ├── FrogbotRESTClient.ts    # fetch wrapper bound to the booted port
│   ├── db/                     # adapter registry + codegen
│   │   └── dbAdapters.ts       # maps FROGBOT_DATABASE to adapter imports
│   ├── storage/                # storage contract suite + skip helpers
│   │   ├── storageContractSuite.ts
│   │   └── skipIfUnreachable.ts
│   └── clearAndSeed/           # truncate + named scenarios
├── database/                   # db adapter contract suite (CRUD)
├── storage/                    # storage adapter suites
│   ├── s3/
│   ├── gcs/
│   ├── azure/
│   ├── vercel-blob/
│   ├── local/
│   └── r2/                     # todo — no local emulator
├── kv/                         # KV adapter suite (Redis)
├── email/                      # email adapter suite (mocked)
├── collections-rest/           # CRUD, pagination, filtering, 404s
├── auth/                       # login, tokens, access control
├── config/                     # buildConfig validation, edge cases
├── plugins/                    # plugin lifecycle, mutation, errors
├── e2e/                        # Playwright specs (*.e2e.spec.ts)
│
│   Each suite contains:
│   ├── config.ts               # default export of buildTestConfig(...)
│   ├── frogbot-types.ts        # committed generated types (per-suite)
│   ├── shared.ts               # slug + fixture constants
│   └── int.spec.ts             # tests (run by `pnpm test:int`)
│
├── docker-compose.yml          # all Docker emulator services
├── vitest.setup.ts             # generates adapter file + TCP probes
└── package.json                # frogbot-test-suite (workspace package)
```

## Principles

1. **Tests speak FrogBot, not Payload.** Use `booted.frogbot.create(...)`,
   never `payload.create(...)`. The test surface is `FrogbotInstance`.
2. **Feature-focused suites.** One directory per concern (auth, config,
   database, plugins, storage, kv, email). Not monolithic.
3. **`buildTestConfig` for all suite configs.** Every `config.ts` uses the
   shared helper — never raw `buildConfig` with manual db/secret/typescript.
4. **`openAccess` for non-auth suites.** Payload denies unauthenticated
   requests by default. Test collections that aren't specifically testing
   access control must use `openAccess`.
5. **No server boot for pure logic.** Suites like `config/` and `plugins/`
   call `buildConfig()` directly without booting a server — fast and isolated.
6. **`typescript: { autoGenerate: false }`** is injected by `buildTestConfig`.
   Payload auto-runs `generate:types` on boot in non-production envs, which
   spawns a child process that hits pre-existing import errors. Disabling it
   keeps test boot clean.
7. **Adapters via `@frogbot/*` packages.** Never import `@payloadcms/db-*`
   directly in tests. Use `@frogbot/db-mongodb` (or future adapters).
   Version is enforced by `pnpm test:versions`.
8. **Graceful skipping.** Tests that require Docker services skip with a
   clear message if the service is unreachable. You can run the full suite
   without all services — only reachable-service tests execute.
9. **Per-suite DB isolation.** Each suite gets a unique database name
   (derived from filename) to avoid conflicts when suites run sequentially
   against shared Docker services.

## Environment Variables

| Variable | Values | Default | Description |
| --- | --- | --- | --- |
| `FROGBOT_DATABASE` | `mongodb`, `postgres`, `sqlite` | `mongodb` | Which DB adapter to use |

## Docker Profiles

| Profile | Services | Port(s) |
| --- | --- | --- |
| `mongodb` | MongoDB 8 | 27018 |
| `postgres` | PostgreSQL (PostGIS + pgvector) | 5433 |
| `storage` | LocalStack (S3), Azurite, fake-gcs-server, Vercel Blob | 4566, 10000, 4443, 3100 |
| `redis` | Redis 7 | 6379 |
| `all` | Everything above | All |

## Convenience Scripts

```bash
pnpm test:int:mongo    # FROGBOT_DATABASE=mongodb
pnpm test:int:pg       # FROGBOT_DATABASE=postgres
pnpm test:int:sqlite   # FROGBOT_DATABASE=sqlite
pnpm docker:clean      # Tear down all containers + volumes
```

## Architecture

### Two-Layer Testing Strategy

- **Layer 1 (Unit)**: Export resolution specs for all 14 adapter packages + 4 drizzle subpaths. Catches broken re-exports on version bumps. No Docker, no services — pure import assertions.
- **Layer 2 (Integration)**: Real Docker emulators running contract suites. Tests exercise frogbot's API surface, not Payload internals directly.

### Database Adapter Swap

The `FROGBOT_DATABASE` env var controls which adapter is used at runtime. The mechanism:

1. `test/vitest.setup.ts` runs before any test imports
2. It reads `FROGBOT_DATABASE` and generates `test/databaseAdapter.js` (a codegen'd file, gitignored)
3. `test/__helpers/shared/buildTestConfig.ts` dynamically imports the generated adapter
4. Each test suite gets a unique DB name (derived from filename) for isolation

This mirrors Payload's adapter swap pattern from their test infrastructure.

### Storage Plugin Pipeline

Storage adapters are wrapped in `@frogbot/storage-*` packages (thin cast from Payload plugin to `FrogbotPlugin` type — same function at runtime). The execution flow:

1. `runPlugins` (frogbot) executes plugins on `FrogbotConfig`
2. Storage plugins inject `upload.handlers` into collections
3. `sanitize()` passes collections through untouched (handlers preserved)
4. Payload receives config with handlers already wired — no re-run needed

Test configs use a single `plugins: [s3Storage(...)]` array, same as a real app would.

### FrogbotInstance Facade

KV and email adapters are exposed through `FrogbotInstance.kv` and `FrogbotInstance.email`:

- `kv` is wired directly from the Payload instance
- `email.sendEmail` is a lazy proxy (supports runtime adapter swap)
- Tests speak frogbot (`frogbot.kv.set(...)`) not Payload (`payload.kv.set(...)`)

All adapter types (`KVAdapter`, `SendEmailOptions`, etc.) are re-exported from the `frogbot` package so users never import from `'payload'` directly.

## Adding a new suite

### 1. Create the directory

```sh
mkdir test/my-feature
```

### 2. Create `shared.ts` — slugs and constants

```ts
export const thingsSlug = 'things';
export const usersSlug = 'users';
```

### 3. Create `config.ts` — use `buildTestConfig`

```ts
import type { CollectionConfig } from 'frogbot';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';
import { thingsSlug, usersSlug } from './shared.js';

const Users: CollectionConfig = {
  slug: usersSlug,
  auth: true,
  access: openAccess,
  fields: [{ name: 'name', type: 'text' }],
};

const Things: CollectionConfig = {
  slug: thingsSlug,
  access: openAccess,
  fields: [{ name: 'title', type: 'text', required: true }],
};

export default buildTestConfig({ collections: [Users, Things] });
```

**`buildTestConfig`** injects:
- `secret: 'test-secret'`
- `db`: adapter from generated `databaseAdapter.js` (controlled by `FROGBOT_DATABASE`)
- `typescript: { autoGenerate: false }`

You only provide `collections` (and optionally `plugins`, `endpoints`, etc).

**`openAccess`** is an object matching Payload's pattern:
```ts
const openAccess = {
  create: () => true,
  delete: () => true,
  read: () => true,
  update: () => true,
};
```

### 4. Create `int.spec.ts`

Two patterns depending on whether you need a server:

#### Pattern A: Server boot (REST or local API tests)

```ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, it, expect } from 'vitest';

import type { BootedFrogbot } from '../__helpers/shared/bootFrogbot';
import { bootFrogbot } from '../__helpers/shared/bootFrogbot';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed';
import { thingsSlug } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('my-feature', () => {
  let booted: BootedFrogbot;

  beforeAll(async () => { booted = await bootFrogbot(dirname); });
  afterAll(async () => { await booted.shutdown(); });
  beforeEach(async () => { await clearAndSeed(booted.frogbot, 'empty'); });

  it('creates via REST', async () => {
    const res = await booted.restClient.post(`/api/${thingsSlug}`, { title: 'Hi' });
    expect(res.status).toBe(201);
  });

  it('creates via local API', async () => {
    const doc = await booted.frogbot.create({
      collection: thingsSlug,
      data: { title: 'Hi' },
      overrideAccess: true,
    });
    expect(doc.title).toBe('Hi');
  });
});
```

#### Pattern B: No server boot (pure `buildConfig` logic)

```ts
import { describe, it, expect } from 'vitest';
import { mongooseAdapter } from '@frogbot/db-mongodb';
import { buildConfig } from 'frogbot';
import type { FrogbotConfig } from 'frogbot';

describe('my-feature', () => {
  it('validates something', async () => {
    const config: FrogbotConfig = {
      secret: 'x',
      db: mongooseAdapter({ url: 'mongodb://localhost:27017/x' }),
      collections: [{ slug: 'users', auth: true, fields: [] }],
    };
    const sanitized = await buildConfig(config);
    expect(sanitized.collections).toBeDefined();
  });
});
```

### 5. Generate types

```sh
pnpm dev:generate-types my-feature
```

This creates `frogbot-types.ts` in your suite directory. Commit it.

### 6. Key rules

- **`FrogbotInstance` methods**: `find`, `findByID`, `create`, `update`, `delete`, `count`.
  - `update` and `delete` are overloaded: pass `id` for single-doc, `where` for bulk.
  - There is no `updateByID` or `deleteByID` — use `update({ id, ... })`.
- **Auth in tests**: For suites testing auth flows, manually POST to
  `/api/<slug>/login` to get a JWT, then pass `Authorization: JWT <token>`
  in subsequent requests. See `test/auth/int.spec.ts`.
- **`overrideAccess: true`**: Use this on local API calls in non-auth suites
  to bypass access control. REST requests rely on `openAccess` in the config.
- **Scenarios**: `clearAndSeed(frogbot, 'empty')` truncates all collections.
  Add richer scenarios under `__helpers/shared/clearAndSeed/scenarios/`.

## `bootFrogbot` internals

`bootFrogbot(dirname)` does:
1. Reads `FROGBOT_DATABASE` and uses the generated adapter
2. Dynamic-imports `<dirname>/config.ts` (must default-export a `buildTestConfig(...)` call)
3. Calls `bootPayload({ config })` via `frogbot/test` (thin wrapper around Payload's `getPayload`)
4. Wraps Payload in a `FrogbotInstance` (same surface as `req.frogbot`)
5. Creates a Hono server via `createServer(payload)`
6. Listens on an ephemeral port
7. Returns `{ frogbot, payload, restClient, baseUrl, shutdown }`

Callers **must** call `shutdown()` in `afterAll`.

The `payload` reference is exposed for adapter injection in tests (e.g., KV tests
wire `payload.kv` through the frogbot facade).

## Adding a scenario

Scenarios live under `__helpers/shared/clearAndSeed/scenarios/` and
compose atomic seeders from `seeders/`. The dispatcher
`clearAndSeed(frogbot, name)` truncates every slug on
`frogbot.collections` (registration order) then invokes the named scenario.

To add a scenario:

1. Add an atomic seeder under `seeders/` if needed
   (e.g. `seeders/projects.ts`). Use `frogbot.create(...)`.
2. Add `scenarios/myScenario.ts` exporting
   `async function myScenario(frogbot: FrogbotInstance)`.
3. Wire into `clearAndSeed/index.ts`: extend the `Scenario` union + map.

## Per-suite generated types

Every suite under `test/<suite>/` owns a committed `frogbot-types.ts` and
a `tsconfig.json`. Each suite's tsconfig includes only its own files so the
`declare module 'frogbot'` augmentation in `frogbot-types.ts` doesn't
conflict across suites.

**FrogBot has its own type generation** (`packages/frogbot/src/bin/generateTypes.ts`).
It does NOT use Payload's `generate:types`. It reads the sanitized config,
runs `configToJSONSchema` + `json-schema-to-typescript`, and emits a
FrogBot-branded file with `declare module 'frogbot' { export interface GeneratedTypes extends Config {} }`.

### Generating types

```sh
# All suites at once (from repo root):
pnpm dev:generate-types

# Single suite:
pnpm dev:generate-types database
```

The script (`test/generateTypes.ts`) finds every suite with a `config.ts`,
sets `FROGBOT_CONFIG_PATH` and `FROGBOT_TS_OUTPUT_PATH`, and invokes
`frogbot generate:types` per suite. Requires `packages/frogbot` to be built
first (`pnpm --filter frogbot build`).

### When to regenerate

Run `pnpm dev:generate-types` after:
- Editing a suite's `config.ts` (adding/removing collections or fields)
- Adding a new suite (create config first, then generate)

CI does **not** regenerate — reviewers see schema drift as a real diff.
Commit the output.

## Known Quirks & Emulator Notes

### Vercel Blob Emulator

The first PUT to the vercel-blob emulator sometimes returns "Unknown error". Fixed by clearing all blobs in a `beforeAll` hook before each test run (using `@vercel/blob` SDK's `list()` + `del()`). This matches Payload's approach.

### R2 (Cloudflare)

No local emulator exists. Payload also only has type-compatibility tests for R2 (no integration tests). Our R2 suite is `it.todo` only. In theory R2 is S3-compatible and could use LocalStack, but the adapter uses wrangler bindings which require a Workers runtime.

### MongoDB Port

Uses port 27018 (not default 27017) to avoid conflicts with any local MongoDB instance you might have running.

### Postgres Image

Uses `ghcr.io/payloadcms/postgis-vector:latest` which bundles PostGIS + pgvector extensions. Same image Payload uses in their CI.

### Email Tests

Fully mocked — no real API calls. Resend tests mock `global.fetch`, Nodemailer tests mock `createTransport().sendMail`. No Docker needed.

## Where to add a test

| Kind | Location | Pattern |
| --- | --- | --- |
| Unit (pure logic, colocated with source) | `packages/**` or `apps/**` | `*.spec.ts` |
| Integration (boot frogbot, hit REST) | `test/<feature>/int.spec.ts` | one suite dir per feature |
| End-to-end (Playwright browser) | `test/e2e/*.e2e.spec.ts` | promote `test.skip` to `test(...)` |

## Running

```sh
pnpm dev:generate-types          # regenerate frogbot-types.ts for ALL suites
pnpm dev:generate-types database # regenerate for a single suite
pnpm test                        # unit + int
pnpm test:unit                   # colocated *.spec.ts under packages/ + apps/
pnpm test:int                    # test/**/*int.spec.ts
pnpm test:int:mongo              # int with MongoDB adapter
pnpm test:int:pg                 # int with Postgres adapter
pnpm test:int:sqlite             # int with SQLite adapter
pnpm test:e2e                    # Playwright
pnpm docker:clean                # tear down all containers + volumes
```

## CI

The GitHub Actions workflow (`.github/workflows/test.yml`) runs:

1. **Unit tests** — always, no Docker
2. **DB integration matrix** — `mongodb` and `postgres` in parallel
3. **Storage + KV integration** — all storage emulators + Redis + MongoDB

SQLite runs without Docker (file-based) but is not in the CI matrix yet since the adapter is experimental.

## Payload Reference

This test infrastructure is modeled after Payload's (v3.85.1). Key differences:

- Payload tests against their own API directly; we test through the `FrogbotInstance` facade
- Payload uses a monorepo with per-package test configs; we use a centralized `test/` directory
- Payload has MongoDB replica set + Atlas search tests; we skip those (not needed for v0)
- Our storage plugins are wrapped (cast to `FrogbotPlugin` type) rather than using Payload's plugin system directly

## First-run caveats

- **Docker images** download on first `docker compose up` (~1-2 GB total for all profiles).
- **Playwright Chromium** downloads ~150 MB; cached at
  `~/Library/Caches/ms-playwright/` (macOS).
  First run: `pnpm exec playwright install --with-deps chromium`
