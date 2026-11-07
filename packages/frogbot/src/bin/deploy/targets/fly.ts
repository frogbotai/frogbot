import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { appSlug, buildArgs, parseTargetArgs, splitVariables, usesFileDatabase } from '../app.js';
import { checkLogin, findTool } from '../preflight.js';
import type { DeployContext, DeployTarget, PreflightIssue } from '../types.js';

const usage = '[--app <name>] [--region <region>]';

const options = { app: { type: 'string' }, region: { type: 'string' } } as const;

const volume = 'frogbot_data';

const fileDatabaseUrl = 'file:/data/frogbot.db';

/** The `examples/fly-sqlite/fly.toml` shape: one machine, stopped when idle, with a volume only for SQLite. */
export function flyToml({
  app,
  region,
  mount,
}: {
  app: string;
  region: string;
  mount: boolean;
}): string {
  return [
    `app = '${app}'`,
    `primary_region = '${region}'`,
    '',
    '[build]',
    '',
    '[http_service]',
    '  internal_port = 3000',
    '  force_https = true',
    "  auto_stop_machines = 'stop'",
    '  auto_start_machines = true',
    '  min_machines_running = 0',
    "  processes = ['app']",
    '',
    '  [[http_service.checks]]',
    "    grace_period = '30s'",
    "    interval = '30s'",
    "    method = 'GET'",
    "    path = '/api/health'",
    "    timeout = '5s'",
    ...(mount ? ['', '[mounts]', `  source = '${volume}'`, "  destination = '/data'"] : []),
    '',
    '[[vm]]',
    "  memory = '1gb'",
    '  cpus = 1',
    '',
  ].join('\n');
}

function readToml(root: string, key: string): string | undefined {
  const path = join(root, 'fly.toml');

  if (!existsSync(path)) return undefined;

  return new RegExp(`^${key}\\s*=\\s*['"]([^'"]+)['"]`, 'm').exec(readFileSync(path, 'utf8'))?.[1];
}

function hasMount(root: string): boolean {
  const toml = readFileSync(join(root, 'fly.toml'), 'utf8');

  return /^\[\[?mounts\]\]?/m.test(toml) && /destination\s*=\s*['"]\/data['"]/.test(toml);
}

async function flyCommand(context: DeployContext): Promise<string> {
  return (await context.io.which('fly')) ? 'fly' : 'flyctl';
}

async function hasVolume(context: DeployContext, fly: string, app: string): Promise<boolean> {
  const { code, stdout } = await context.io.exec(fly, ['volumes', 'list', '--app', app, '--json']);

  if (code !== 0) return false;

  try {
    return (JSON.parse(stdout) as { name?: string }[]).some((item) => item.name === volume);
  } catch {
    return false;
  }
}

/** `frogbot deploy fly`: one Fly.io machine, with a volume when the database is a SQLite file. */
export const flyTarget: DeployTarget = {
  describe: 'Deploy to Fly.io with your fly login (one machine, SQLite on a volume)',
  preflight: async (context) => {
    const flags = parseTargetArgs(context, { target: 'fly', usage, options });
    const { command, issue } = await findTool(
      context.io,
      ['fly', 'flyctl'],
      'Install flyctl: https://fly.io/docs/flyctl/install/',
    );

    if (!command) return issue ? [issue] : [];

    const issues: PreflightIssue[] = [];
    const existing = readToml(context.root, 'app');

    if (existing && flags.app && flags.app !== existing) {
      issues.push({
        code: 'FLY_APP_MISMATCH',
        message: `fly.toml deploys the app ${existing}, not ${flags.app}.`,
        fix: `Drop --app, or delete fly.toml to deploy ${flags.app} as a new app.`,
      });
    }

    if (existing && usesFileDatabase(context) && !hasMount(context.root)) {
      issues.push({
        code: 'FLY_NO_MOUNT',
        message:
          'DATABASE_URL is a SQLite file, but fly.toml mounts no volume at /data, so the data would vanish on every restart.',
        fix: `Add \`[mounts]\` with \`source = '${volume}'\` and \`destination = '/data'\` to fly.toml, or point DATABASE_URL at a hosted database.`,
      });
    }

    const login = await checkLogin(context.io, command, ['auth', 'whoami'], 'fly auth login');

    return login ? [login, ...issues] : issues;
  },
  run: async (context) => {
    const flags = parseTargetArgs(context, { target: 'fly', usage, options });
    const fly = await flyCommand(context);
    const existing = readToml(context.root, 'app');
    const app = existing ?? flags.app ?? appSlug(context.root);
    const region = readToml(context.root, 'primary_region') ?? flags.region ?? 'iad';
    const fileDatabase = usesFileDatabase(context);

    if (!existing) {
      await context.run(fly, ['apps', 'create', app]);
      await context.writeFile('fly.toml', flyToml({ app, region, mount: fileDatabase }));
    }

    if (fileDatabase && !(existing && (await hasVolume(context, fly, app)))) {
      await context.run(fly, [
        'volumes',
        'create',
        volume,
        '--size',
        '1',
        '--region',
        region,
        '--app',
        app,
        '--yes',
      ]);
    }

    const { secrets, build } = splitVariables(context);

    if (fileDatabase) secrets.DATABASE_URL = fileDatabaseUrl;

    await context.run(fly, ['secrets', 'import', '--app', app, '--stage'], {
      input: Object.entries(secrets)
        .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
        .join('\n'),
    });

    await context.run(fly, ['deploy', '--app', app, '--ha=false', ...buildArgs(context, build)]);

    const url = `https://${app}.fly.dev`;

    if (!context.flags.dryRun) context.log(`[frogbot] Deployed: ${url}`);

    return { app, url };
  },
};
