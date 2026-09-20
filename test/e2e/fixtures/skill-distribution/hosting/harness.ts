import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { accessSync, constants, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { stripVTControlCharacters } from 'node:util';

export const repoRoot = resolve(import.meta.dirname, '../../../../..');
export const fixtureRoot = import.meta.dirname;
export const legacyBase = '/.well-known/skills';
export const legacyIndex = `${legacyBase}/index.json`;
export const legacyEntry = `${legacyBase}/frogbot/SKILL.md`;
export const modernIndex = '/.well-known/agent-skills/index.json';
export const modernEntry = '/.well-known/agent-skills/frogbot/SKILL.md';

export type HostingRequest = { method: string; path: string; status: number };
export type HostingResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
};

export function preparedClient(variable: string) {
  const executable = process.env[variable];

  if (!executable || !isAbsolute(executable)) {
    return {
      executable: '',
      missing: `Prerequisite: ${variable} must name an absolute prepared executable`,
    };
  }

  try {
    accessSync(executable, constants.X_OK);

    return { executable, missing: '' };
  } catch {
    return {
      executable: '',
      missing: `Prerequisite: ${variable} is not executable: ${executable}`,
    };
  }
}

export function createProfile() {
  const root = mkdtempSync(join(fixtureRoot, 'run-'));
  const home = join(root, 'home');
  const project = join(root, 'project');
  const config = join(root, 'config');
  const cache = join(root, 'cache');
  const data = join(root, 'data');
  const state = join(root, 'state');
  const temp = join(root, 'tmp');
  const configDir = join(config, 'opencode');

  for (const directory of [home, project, configDir, cache, data, state, temp]) {
    mkdirSync(directory, { recursive: true });
  }

  const env: NodeJS.ProcessEnv = {
    PATH: `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
    HOME: home,
    XDG_CONFIG_HOME: config,
    XDG_CACHE_HOME: cache,
    XDG_DATA_HOME: data,
    XDG_STATE_HOME: state,
    TMPDIR: temp,
    TMP: temp,
    TEMP: temp,
    CI: '1',
    NO_COLOR: '1',
    TERM: 'dumb',
    DISABLE_TELEMETRY: '1',
    DO_NOT_TRACK: '1',
    OTEL_SDK_DISABLED: 'true',
    NODE_DISABLE_COMPILE_CACHE: '1',
    OPENCODE_TEST_HOME: home,
    OPENCODE_CONFIG_DIR: configDir,
    OPENCODE_CONFIG: join(configDir, 'opencode.json'),
    OPENCODE_AUTH_CONTENT: '{}',
    OPENCODE_PURE: '1',
    OPENCODE_DISABLE_PROJECT_CONFIG: '1',
    OPENCODE_DISABLE_EXTERNAL_SKILLS: '1',
    OPENCODE_DISABLE_DEFAULT_PLUGINS: '1',
    OPENCODE_DISABLE_AUTOUPDATE: '1',
    OPENCODE_DISABLE_MODELS_FETCH: '1',
    OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER: '1',
    npm_config_offline: 'true',
    npm_config_cache: join(cache, 'npm'),
    npm_config_userconfig: join(home, '.npmrc'),
    npm_config_globalconfig: join(home, 'global.npmrc'),
  };

  writeFileSync(env.npm_config_userconfig!, 'offline=true\n');
  writeFileSync(env.npm_config_globalconfig!, '');

  const configure = (url?: string) => {
    writeFileSync(
      env.OPENCODE_CONFIG!,
      JSON.stringify({
        skills: { urls: url ? [url] : [] },
        enabled_providers: [],
        plugin: [],
        mcp: {},
        autoupdate: false,
        share: 'disabled',
        experimental: { openTelemetry: false },
      }),
    );
  };

  configure();

  return {
    root,
    project,
    env,
    configure,
    installed: join(project, '.agents/skills/frogbot'),
    cached: join(cache, 'opencode/skills/frogbot'),
  };
}

export type HostingProfile = ReturnType<typeof createProfile>;

export function runClient({
  executable,
  args,
  profile,
}: {
  executable: string;
  args: string[];
  profile: HostingProfile;
}): Promise<HostingResult> {
  return new Promise((resolveExit, reject) => {
    const child = spawn(executable, args, {
      cwd: profile.project,
      env: profile.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, 45000);

    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);

      const result = {
        code,
        signal,
        stdout: stripVTControlCharacters(stdout),
        stderr: stripVTControlCharacters(stderr),
      };

      if (timedOut) {
        reject(new Error(`Client timed out: ${JSON.stringify({ executable, args, ...result })}`));

        return;
      }

      resolveExit(result);
    });
  });
}

export async function createHost(entry: Buffer) {
  const routes = new Map<string, Buffer | string>();
  const requests: HostingRequest[] = [];
  const server = createServer((request, response) => {
    const path = request.url ?? '/';
    const body = routes.get(path);
    const status = request.method === 'GET' && body !== undefined ? 200 : 404;

    requests.push({ method: request.method ?? '', path, status });
    response.writeHead(status, {
      'content-type': path.endsWith('.json') ? 'application/json' : 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(status === 200 ? body : 'Not found');
  });

  await new Promise<void>((resolveListening, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListening);
  });

  const address = server.address();

  if (!address || typeof address === 'string') throw new Error('Missing loopback address');

  const origin = `http://127.0.0.1:${address.port}`;

  return {
    origin,
    routes,
    requests,
    modern({ mismatch = false, missing = false } = {}) {
      routes.clear();
      routes.set(
        modernIndex,
        JSON.stringify({
          $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
          skills: [
            {
              name: 'frogbot',
              description: 'FrogBot development skill',
              type: 'skill-md',
              url: './frogbot/SKILL.md',
              digest: `sha256:${mismatch ? '0'.repeat(64) : createHash('sha256').update(entry).digest('hex')}`,
            },
          ],
        }),
      );

      if (!missing) routes.set(modernEntry, entry);
    },
    legacy({ lowercase = false, missing = false } = {}) {
      routes.clear();
      routes.set(
        legacyIndex,
        JSON.stringify({
          skills: [
            { name: 'frogbot', description: 'FrogBot development skill', files: ['SKILL.md'] },
          ],
        }),
      );

      if (!missing) {
        routes.set(lowercase ? legacyEntry.replace('SKILL.md', 'skill.md') : legacyEntry, entry);
      }
    },
    close() {
      return new Promise<void>((resolveClosed, reject) => {
        server.close((error) => (error ? reject(error) : resolveClosed()));
        server.closeAllConnections();
      });
    },
  };
}

export type HostingHost = Awaited<ReturnType<typeof createHost>>;

export function fallbackURLs(content: string) {
  return [
    ...content.matchAll(
      /https:\/\/raw\.githubusercontent\.com\/frogbotai\/frogbot\/main\/skills\/frogbot\/reference\/[A-Z-]+\.md/g,
    ),
  ].map((match) => match[0]);
}
