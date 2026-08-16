# FrogBot on Fly.io with SQLite

Deploy a FrogBot app to [Fly.io](https://fly.io) with SQLite on a persistent volume. This example is the blank template plus everything production SQLite needs:

- **`fly.toml`** with a `[mounts]` volume for the database and scale-to-zero enabled
- **Generated migrations** (`src/migrations/`) wired into `prodMigrations`, so a fresh database gets its schema automatically on first boot — in production Payload does **not** push schema like it does in dev
- The template's **standalone Dockerfile** (package-manager agnostic, ~110MB final image, starts with plain `node server.js`)

## Deploy

```bash
# 1. Install dependencies and log in to Fly
pnpm install # or npm / yarn
fly auth login

# 2. Create the app (keep the existing fly.toml and Dockerfile when prompted)
fly launch --no-deploy

# 3. Create the volume the database lives on
fly volumes create frogbot_data --size 1 --region <your-region>

# 4. Set secrets: the Payload secret and the database path on the volume
fly secrets set FROGBOT_SECRET=$(openssl rand -hex 32) DATABASE_URL=file:/data/frogbot.db

# 5. Deploy, then pin to a single machine (a volume attaches to one machine)
fly deploy
fly scale count 1
```

Visit `https://<your-app>.fly.dev/admin` to create your first admin user.

## Why a single machine?

A Fly volume attaches to one machine at a time, and SQLite is a local file — so this setup runs one machine. Scale-to-zero (`min_machines_running = 0`) still works: the machine stops when idle and the data survives on the volume. If you need multiple machines, switch to a remote database (Postgres, MongoDB, or a hosted SQLite like Turso) and remove the `[mounts]` section.

## Changing collections

The schema in production comes from migrations, not auto-push. After you add or change collections:

```bash
pnpm migrate:create my_change   # generates src/migrations/<timestamp>_my_change.ts
```

Commit the generated files. They are applied automatically on the next deploy, or manually with `pnpm migrate`.

## Local development

```bash
cp .env.example .env   # set FROGBOT_SECRET, keep DATABASE_URL=file:./frogbot.db
pnpm dev
```

In dev, the schema is pushed automatically — migrations only matter for production.
