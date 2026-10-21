import { openAsBlob } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { checkAppRoot, findAppRoot } from './appRoot.js';
import type { ShareArchive } from './archive.js';
import { createArchive } from './archive.js';
import { authPath } from './auth.js';
import { askData } from './data/ask.js';
import type { DataInventory } from './data/inventory.js';
import { describeData } from './data/inventory.js';
import { formatBytes, uploadData } from './data/upload.js';
import type { DojoClient, DojoErrorBody } from './dojo.js';
import { createDojo, dojoError, dojoMessage, followBuild } from './dojo.js';
import type { EnvKey } from './envKeys.js';
import { envKeys, readEnvFiles } from './envKeys.js';
import { ShareError } from './error.js';
import { shareFiles } from './files.js';
import type { ShareIO } from './io.js';
import { say } from './io.js';
import type { LiveKeys } from './keys.js';
import { chooseFirstKeys, compareLiveKeys } from './keys.js';
import { linkPath, readLink, writeLink } from './link.js';
import type { SealedKeys, SealingKey } from './seal.js';
import { sealKeys } from './seal.js';

const usage =
  'Usage: frogbot share [--data | --no-data] [--workspace <slug>] [--name <name>] [--no-keys] [--skip-key <NAME>]... [--yes] [--update-keys]';

type ShareFlags = {
  data?: boolean;
  workspace?: string;
  name?: string;
  keys: boolean;
  skipKey: string[];
  yes: boolean;
  updateKeys: boolean;
};

type Workspace = { id: string | number; name: string; slug: string };

type AppInfo = { started: boolean; level: 'editor' | 'owner' };

function parseShareArgs(argv: string[]): ShareFlags {
  let parsed;

  try {
    parsed = parseArgs({
      args: argv,
      options: {
        data: { type: 'boolean' },
        workspace: { type: 'string' },
        name: { type: 'string' },
        keys: { type: 'boolean', default: true },
        'skip-key': { type: 'string', multiple: true, default: [] },
        yes: { type: 'boolean', default: false },
        'update-keys': { type: 'boolean', default: false },
      },
      allowNegative: true,
      strict: true,
      tokens: true,
    });
  } catch (error) {
    throw new ShareError(`${(error as Error).message} ${usage}`, 2);
  }

  const dataFlags = new Set(
    parsed.tokens.flatMap((token) =>
      token.kind === 'option' && token.name === 'data' ? [token.rawName] : [],
    ),
  );

  if (dataFlags.size > 1) throw new ShareError(`Use --data or --no-data, not both. ${usage}`, 2);

  const { values } = parsed;

  return {
    data: values.data,
    workspace: values.workspace,
    name: values.name,
    keys: values.keys,
    skipKey: values['skip-key'],
    yes: values.yes,
    updateKeys: values['update-keys'],
  };
}

/** Runs `frogbot share` and returns its exit code; known stops print one `[frogbot]` line. */
export async function runShare(argv: string[], io: ShareIO): Promise<number> {
  try {
    await share(argv, io);

    return 0;
  } catch (error) {
    if (!(error instanceof ShareError)) throw error;

    io.stderr.write(`[frogbot] ${error.message}\n`);

    return error.code;
  }
}

async function share(argv: string[], io: ShareIO): Promise<void> {
  const flags = parseShareArgs(argv);
  const root = findAppRoot({ cwd: io.cwd, env: io.env });

  checkAppRoot(root);

  const link = await readLink(root);
  const fileEnv = readEnvFiles(root);
  const allKeys = envKeys(fileEnv);

  checkSkipKeys(flags.skipKey, allKeys);

  const config = await io.loadConfig(root);
  const dojo = createDojo(io);
  const { started, level }: AppInfo = link
    ? await appInfo(dojo, link.appId)
    : { started: false, level: 'owner' };

  const editor = level === 'editor';

  if (started && flags.data) {
    say(io, '[frogbot] Data comes only with the first share; sharing code only.');
  }

  const data = started ? undefined : await askData({ data: flags.data, root, config, io });
  let archive: ShareArchive | undefined;

  try {
    const { files, symlinks } = await shareFiles({
      root,
      collections: config.collections,
      databaseUrl: fileEnv.DATABASE_URL ?? io.env.DATABASE_URL,
      authFile: resolve(io.cwd, authPath(io.env)),
    });

    if (symlinks.length > 0) {
      say(
        io,
        `[frogbot] Skipped ${symlinks.length} ${symlinks.length === 1 ? 'symlink' : 'symlinks'}: ${symlinks.join(', ')}`,
      );
    }

    archive = await createArchive({ root, files });

    const localKeys = flags.keys ? allKeys.filter((key) => !flags.skipKey.includes(key.name)) : [];

    const firstKeys = link ? [] : await chooseFirstKeys({ keys: localKeys, yes: flags.yes, io });

    await dojo.signIn();

    const appId = link?.appId ?? (await createApp({ dojo, io, flags, root }));

    if (editor && (localKeys.length > 0 || flags.updateKeys)) {
      say(io, "[frogbot] Keys left out: only the app's owners manage its keys on Dojo.");
    }

    const keys = editor
      ? []
      : link
        ? await laterKeys({ dojo, io, appId, keys: localKeys, updateKeys: flags.updateKeys })
        : firstKeys;

    const secret = fileEnv.FROGBOT_SECRET ?? io.env.FROGBOT_SECRET;

    if (data) {
      say(io, `[frogbot] Bringing data: ${describeData(data)} (${formatBytes(data.totalBytes)})`);
      leftOut(io, data);

      if (!secret) {
        say(
          io,
          "[frogbot] There's no local FROGBOT_SECRET, so connections stored in the data won't open on Dojo.",
        );
      }

      await uploadData({ dojo, appId, inventory: data, io });
    }

    say(io, `[frogbot] ${archive.summary}`);

    const deploymentId = await deploy({
      dojo,
      appId,
      archive,
      keys: data && secret ? [...keys, { name: 'FROGBOT_SECRET', value: secret }] : keys,
      updateKeys: !editor && flags.updateKeys,
      data: started ? undefined : Boolean(data),
    });

    const build = await followBuild({
      dojo,
      deploymentId,
      onLine: (line) => say(io, `[build] ${line}`),
    });

    if (build.status === 'failed') {
      throw new ShareError(
        [`Build failed: ${build.error || 'see the log above'}`, ...(build.tail ?? [])].join('\n'),
      );
    }

    if (!editor) {
      say(io, `[frogbot] Share it: ${dojo.url}/admin/collections/projects/${appId}?share=1`);
    }

    if (build.url) say(io, build.url);
  } finally {
    await archive?.remove();
    await data?.dispose();
  }
}

function leftOut(io: ShareIO, { leftFolders, leftNames }: DataInventory): void {
  for (const folder of leftFolders) {
    say(
      io,
      `[frogbot] Left out the files of ${folder}: the folder is the app, holds it, or is outside it.`,
    );
  }

  if (leftNames.length > 0) {
    say(
      io,
      `[frogbot] Left out ${leftNames.length} ${leftNames.length === 1 ? 'file' : 'files'} whose names Dojo can't store: ${leftNames.map(visible).join(', ')}`,
    );
  }
}

// eslint-disable-next-line no-control-regex -- shown escaped so a file name can't drive the terminal
const controlCharacters = /[\u0000-\u001f]/g;

function visible(name: string): string {
  return name.replace(
    controlCharacters,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

function checkSkipKeys(skipKey: string[], keys: EnvKey[]): void {
  const names = keys.map((key) => key.name);
  const unknown = skipKey.filter((name) => !names.includes(name));

  if (unknown.length === 0) return;

  throw new ShareError(
    `No ${unknown.length === 1 ? 'key' : 'keys'} named ${unknown.join(', ')}; ${names.length > 0 ? `keys are: ${names.join(', ')}` : 'the .env files have no keys'}.`,
    2,
  );
}

async function appInfo(dojo: DojoClient, appId: string | number): Promise<AppInfo> {
  const response = await dojo.request(`/api/apps/${appId}`);

  await refusedApp(appId, response);

  if (!response.ok) throw new ShareError(`Couldn't read the app: ${await dojoMessage(response)}`);

  const app = (await response.json()) as { started?: boolean; level?: string };

  return { started: app.started === true, level: app.level === 'editor' ? 'editor' : 'owner' };
}

async function appName(root: string): Promise<string> {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as { name?: unknown };

  return typeof pkg.name === 'string' && pkg.name
    ? pkg.name.replace(/^@[^/]+\//, '')
    : basename(root);
}

function toSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 63)
    .replace(/^-+|-+$/g, '');

  return slug || 'app';
}

function nameTaken(status: number, body: DojoErrorBody | undefined): boolean {
  if (status === 409 && body?.error === 'name_taken') return true;

  return (
    body?.errors?.some((error) =>
      error.data?.errors?.some(
        (field) => field.path === 'slug' && field.message === 'Value must be unique',
      ),
    ) ?? false
  );
}

async function createApp({
  dojo,
  io,
  flags,
  root,
}: {
  dojo: DojoClient;
  io: ShareIO;
  flags: ShareFlags;
  root: string;
}): Promise<string | number> {
  const listed = await dojo.request('/api/workspaces?depth=0&limit=100');

  if (!listed.ok) {
    throw new ShareError(`Couldn't list your workspaces: ${await dojoMessage(listed)}`);
  }

  const { docs } = (await listed.json()) as { docs: Workspace[] };
  const workspace = await pickWorkspace({ workspaces: docs, flags, io, dojoUrl: dojo.url });
  const name = await appName(root);
  const slug = toSlug(flags.name ?? name);

  const created = await dojo.request('/api/projects?depth=0', () => ({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, slug, workspace: workspace.id }),
  }));

  if (!created.ok) {
    const { body, message } = await dojoError(created);

    if (nameTaken(created.status, body)) {
      throw new ShareError(
        `The name "${slug}" is taken on Dojo. Rerun with --name <another name>.`,
      );
    }

    throw new ShareError(`Dojo couldn't create the app: ${message}`);
  }

  const { doc } = (await created.json()) as { doc: { id: string | number; slug: string } };

  await writeLink(root, { appId: doc.id });

  say(io, `[frogbot] Created ${doc.slug} in ${workspace.name}, linked in ${linkPath}.`);

  return doc.id;
}

async function pickWorkspace({
  workspaces,
  flags,
  io,
  dojoUrl,
}: {
  workspaces: Workspace[];
  flags: ShareFlags;
  io: ShareIO;
  dojoUrl: string;
}): Promise<Workspace> {
  const slugs = workspaces.map((workspace) => workspace.slug).join(', ');

  if (flags.workspace) {
    const chosen = workspaces.find((workspace) => workspace.slug === flags.workspace);

    if (!chosen) {
      throw new ShareError(`No workspace "${flags.workspace}" in Dojo. Yours: ${slugs}.`);
    }

    return chosen;
  }

  const [only] = workspaces;

  if (!only) {
    throw new ShareError(`You have no workspace in ${dojoUrl}. Create one there, then rerun.`);
  }

  if (workspaces.length === 1) return only;

  if (!io.isTTY) {
    throw new ShareError(
      `Ask the person which workspace to share in (${slugs}), then rerun with --workspace <slug>.`,
    );
  }

  const slug = await io.prompts.select(
    'Which workspace?',
    workspaces.map((workspace) => ({ value: workspace.slug, label: workspace.name })),
  );

  return workspaces.find((workspace) => workspace.slug === slug) ?? only;
}

async function laterKeys({
  dojo,
  io,
  appId,
  keys,
  updateKeys,
}: {
  dojo: DojoClient;
  io: ShareIO;
  appId: string | number;
  keys: EnvKey[];
  updateKeys: boolean;
}): Promise<EnvKey[]> {
  if (keys.length === 0) return [];

  const response = await dojo.request(`/api/apps/${appId}/keys`);

  await refusedApp(appId, response);

  if (!response.ok) {
    throw new ShareError(`Couldn't read the app's keys: ${await dojoMessage(response)}`);
  }

  const { salt, keys: live } = (await response.json()) as Partial<LiveKeys>;

  if (typeof salt !== 'string' || !Array.isArray(live)) {
    throw new ShareError("Couldn't read the app's keys: Dojo sent no salt or key list.");
  }

  return compareLiveKeys({ keys, live: { salt, keys: live }, appId, updateKeys, io });
}

async function sealedKeys(dojo: DojoClient, keys: EnvKey[]): Promise<SealedKeys> {
  const response = await dojo.request('/api/cli/sealing-key');

  if (!response.ok) {
    throw new ShareError(
      `Couldn't get Dojo's key for sealing keys: ${await dojoMessage(response)}`,
    );
  }

  const sealingKey = (await response.json()) as SealingKey;

  return sealKeys(Object.fromEntries(keys.map((key) => [key.name, key.value])), sealingKey);
}

async function refusedApp(appId: string | number, response: Response): Promise<void> {
  if (response.status !== 403 && response.status !== 404) return;

  throw new ShareError(
    `You can't share to the app in ${linkPath} (${appId}): ${await dojoMessage(response)} Delete ${linkPath} to share as a new app.`,
  );
}

async function deploy({
  dojo,
  appId,
  archive,
  keys,
  updateKeys,
  data,
}: {
  dojo: DojoClient;
  appId: string | number;
  archive: ShareArchive;
  keys: EnvKey[];
  updateKeys: boolean;
  data: boolean | undefined;
}): Promise<string | number> {
  const keysPart =
    keys.length > 0
      ? JSON.stringify({ ...(await sealedKeys(dojo, keys)), ...(updateKeys ? { updateKeys } : {}) })
      : undefined;

  const response = await dojo.request(`/api/apps/${appId}/deployments`, async () => {
    const form = new FormData();

    form.append(
      'source',
      await openAsBlob(archive.path, { type: 'application/gzip' }),
      'source.tar.gz',
    );

    if (keysPart) form.append('keys', keysPart);
    if (data !== undefined) form.append('data', String(data));

    return { method: 'POST', body: form };
  });

  await refusedApp(appId, response);

  if (!response.ok) throw new ShareError(`Dojo refused the upload: ${await dojoMessage(response)}`);

  return ((await response.json()) as { deploymentId: string | number }).deploymentId;
}
