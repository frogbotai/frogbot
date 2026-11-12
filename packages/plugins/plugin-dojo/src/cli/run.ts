import { openAsBlob } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import type { DeployConfig, DeployContext, DeployIO, PreflightIssue } from 'frogbot';
import { DeployError, loadConfig, processDeployIO, runDeploy } from 'frogbot/internal';

import { dojoTarget } from '../deploy.js';
import { nameTaken, toSlug } from './appSlug.js';
import type { ShareArchive } from './archive.js';
import { createArchive } from './archive.js';
import { authPath } from './auth.js';
import { askData } from './data/ask.js';
import type { DataInventory } from './data/inventory.js';
import { describeData, takeInventory } from './data/inventory.js';
import { askReplace, replaceMessages } from './data/replace.js';
import { formatBytes, uploadData } from './data/upload.js';
import type { DojoClient } from './dojo.js';
import { createDojo, followBuild, segment } from './dojo.js';
import type { EnvKey } from './envKeys.js';
import { envKeys, readEnvFiles } from './envKeys.js';
import { dojoError, dojoStop, ShareError } from './error.js';
import { shareFiles } from './files.js';
import type { ShareFlags } from './flags.js';
import { parseShareArgs } from './flags.js';
import type { DojoIO } from './io.js';
import { say } from './io.js';
import type { LiveKeys } from './keys.js';
import { chooseFirstKeys, compareLiveKeys } from './keys.js';
import type { AppLink } from './link.js';
import { linkPath, readLink, writeLink } from './link.js';
import { whenPaid } from './payment.js';
import type { SealedKeys, SealingKey } from './seal.js';
import { sealKeys } from './seal.js';
import type { AppInfo } from './target.js';
import { appFromFlag, appInfo, refusedApp } from './target.js';
import { chooseWorkspace } from './workspaces.js';

/** Runs `frogbot share`, the same as `frogbot deploy dojo`, and returns its exit code. */
export async function runShare(argv: string[], io: DeployIO): Promise<number> {
  return runDeploy(dojoTarget, argv, io, { name: 'dojo' });
}

async function loadShareConfig(root: string): Promise<DeployConfig> {
  const config = await loadConfig({ cwd: root, mode: 'codegen' });

  return config._internal.payloadConfig;
}

/** `share` on the real terminal, with the programs and app config `deploy` needs. */
export async function runShareCommand(argv: string[], io: DojoIO): Promise<number> {
  return runShare(argv, {
    ...processDeployIO({ program: io.program, loadConfig: loadShareConfig }),
    ...io,
  });
}

async function asDeployStop<T>(work: () => T | Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ShareError) {
      throw new DeployError(error.message, error.exitCode, {
        code: error.code,
        fields: error.fields,
        cause: error.cause,
      });
    }

    throw error;
  }
}

/** The `dojo` target's own checks: its flags and the keys `--skip-key` names. */
export async function sharePreflight(context: DeployContext): Promise<PreflightIssue[]> {
  return asDeployStop(() => {
    const flags = parseShareArgs(context.args, context.io.program);

    checkSkipKeys(flags.skipKey, envKeys(readEnvFiles(context.root)));

    return [];
  });
}

/** Sends the app to Dojo: `share`'s and `deploy dojo`'s body. Under `--json` its progress goes to stderr. */
export async function shareToDojo(context: DeployContext): Promise<Record<string, unknown>> {
  const io = context.flags.json ? { ...context.io, stdout: context.io.stderr } : context.io;

  return asDeployStop(() => share({ ...context, io }));
}

async function share(context: DeployContext): Promise<Record<string, unknown>> {
  const { root, config, io } = context;
  const flags = parseShareArgs(context.args, io.program);
  const folderLink = await readLink(root);
  const fileEnv = readEnvFiles(root);
  const allKeys = envKeys(fileEnv);

  if (context.flags.dryRun) {
    return dryRun({
      context,
      flags,
      link: folderLink,
      keys: allKeys,
      databaseUrl: fileEnv.DATABASE_URL,
    });
  }

  const dojo = createDojo(io);
  const target = flags.app ? await appFromFlag({ dojo, ref: flags.app, folderLink }) : undefined;

  const link = target?.link ?? folderLink;
  const { started, level, slug }: AppInfo =
    target ?? (link ? await appInfo(dojo, link.appId) : { started: false, level: 'owner' });

  const editor = level === 'editor';

  const replacing = started && flags.replaceData;

  if (started && flags.data && !replacing) say(io, `[frogbot] ${replaceMessages.firstShareOnly}`);

  const data = replacing
    ? await askReplace({ slug: slug ?? String(link?.appId), level, root, config, io })
    : started
      ? undefined
      : await askData({ data: flags.replaceData || flags.data, root, config, io });

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

      await uploadData({ dojo, appId, inventory: data, io, replace: replacing });
    }

    say(io, `[frogbot] ${archive.summary}`);

    const deploymentId = await deploy({
      dojo,
      io,
      appId,
      archive,
      keys: data && secret ? [...keys, { name: 'FROGBOT_SECRET', value: secret }] : keys,
      updateKeys: !editor && flags.updateKeys,
      data: replacing ? 'replace' : started ? undefined : Boolean(data),
    });

    if (target && !folderLink) await writeLink(root, target.link);

    const build = await followBuild({
      dojo,
      deploymentId,
      onLine: (line) => say(io, `[build] ${line}`),
    }).catch((error: unknown) => {
      if (!(error instanceof ShareError) || error.deploymentId !== undefined) throw error;

      throw new ShareError(
        `${error.message} The build may still finish: run \`frogbot dojo deployments logs ${deploymentId} --follow\`.`,
        error.exitCode,
        { code: error.code, status: error.status, url: error.url, deploymentId, cause: error },
      );
    });

    if (build.status === 'failed') {
      throw new ShareError(
        [
          `Build failed: ${build.error || 'see the log above'}`,
          ...(build.tail ?? []),
          `Run \`frogbot dojo deployments logs ${deploymentId}\` for the full log.`,
        ].join('\n'),
        1,
        { code: 'BUILD_FAILED', deploymentId },
      );
    }

    const shareLink = editor ? null : `${dojo.url}/collections/apps/${appId}/settings?share=1`;

    if (shareLink) say(io, `[frogbot] Share it: ${shareLink}`);
    if (build.url) say(io, build.url);

    return { appId, url: build.url ?? null, shareLink };
  } finally {
    await archive?.remove();
    await data?.dispose();
  }
}

async function dryRun({
  context,
  flags,
  link,
  keys,
  databaseUrl,
}: {
  context: DeployContext;
  flags: ShareFlags;
  link: AppLink | undefined;
  keys: EnvKey[];
  databaseUrl: string | undefined;
}): Promise<Record<string, unknown>> {
  const { root, config, io } = context;
  const { files } = await shareFiles({
    root,
    collections: config.collections,
    databaseUrl: databaseUrl ?? io.env.DATABASE_URL,
    authFile: resolve(io.cwd, authPath(io.env)),
  });

  const archive = await createArchive({ root, files });

  try {
    const sent = flags.keys
      ? keys.filter((key) => !flags.skipKey.includes(key.name)).map((key) => key.name)
      : [];

    const inventory = !link && flags.data ? await takeInventory({ root, config }) : undefined;
    const data = inventory && inventory !== 'unsupported' ? describeData(inventory) : undefined;

    if (inventory && inventory !== 'unsupported') await inventory.dispose();

    context.log(
      `[dry-run] ${flags.app !== undefined ? `Update the app ${flags.app} and link it in ${linkPath}` : link ? `Update the app in ${linkPath} (${link.appId})` : 'Create a new app on Dojo'}`,
    );

    context.log(`[dry-run] ${archive.summary.replace(/^Uploading/, 'Upload')}`);
    context.log(`[dry-run] Keys: ${sent.length > 0 ? sent.join(', ') : 'none'}`);
    context.log(`[dry-run] Data: ${data ?? 'none'}`);

    return { appId: link?.appId, files: files.length, bytes: archive.bytes, keys: sent, data };
  } finally {
    await archive.remove();
  }
}

function leftOut(io: DeployIO, { leftFolders, leftNames }: DataInventory): void {
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

async function appName(root: string): Promise<string> {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as { name?: unknown };

  return typeof pkg.name === 'string' && pkg.name
    ? pkg.name.replace(/^@[^/]+\//, '')
    : basename(root);
}

async function createApp({
  dojo,
  io,
  flags,
  root,
}: {
  dojo: DojoClient;
  io: DeployIO;
  flags: ShareFlags;
  root: string;
}): Promise<string | number> {
  const workspace = await chooseWorkspace({ dojo, io, slug: flags.workspace });
  const name = await appName(root);
  const slug = toSlug(flags.name ?? name);

  const created = await whenPaid(dojo, io, () =>
    dojo.request('/api/apps?depth=0', () => ({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, slug, workspace: workspace.id }),
    })),
  );

  if (!created.ok) {
    const stop = await dojoStop(created.clone(), "Dojo couldn't create the app");

    if (nameTaken(created.status, (await dojoError(created)).body)) {
      throw new ShareError(
        `The name "${slug}" is taken on Dojo. Rerun with --name <another name>.`,
      );
    }

    throw stop;
  }

  const { doc } = (await created.json()) as { doc: { id: string | number; slug: string } };

  await writeLink(root, { appId: doc.id });

  say(io, `[frogbot] Created ${doc.slug} in ${workspace.name}, linked in ${linkPath}.`);

  return doc.id;
}

async function laterKeys({
  dojo,
  io,
  appId,
  keys,
  updateKeys,
}: {
  dojo: DojoClient;
  io: DeployIO;
  appId: string | number;
  keys: EnvKey[];
  updateKeys: boolean;
}): Promise<EnvKey[]> {
  if (keys.length === 0) return [];

  const response = await dojo.request(`/api/apps/${segment(appId)}/keys`);

  await refusedApp(appId, response);

  if (!response.ok) {
    throw await dojoStop(response, "Couldn't read the app's keys");
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
    throw await dojoStop(response, "Couldn't get Dojo's key for sealing keys");
  }

  const sealingKey = (await response.json()) as SealingKey;

  return sealKeys(Object.fromEntries(keys.map((key) => [key.name, key.value])), sealingKey);
}

async function deploy({
  dojo,
  io,
  appId,
  archive,
  keys,
  updateKeys,
  data,
}: {
  dojo: DojoClient;
  io: DeployIO;
  appId: string | number;
  archive: ShareArchive;
  keys: EnvKey[];
  updateKeys: boolean;
  data: boolean | 'replace' | undefined;
}): Promise<string | number> {
  const keysPart =
    keys.length > 0
      ? JSON.stringify({ ...(await sealedKeys(dojo, keys)), ...(updateKeys ? { updateKeys } : {}) })
      : undefined;

  const response = await whenPaid(dojo, io, () =>
    dojo.request(`/api/apps/${segment(appId)}/deployments`, async () => {
      const form = new FormData();

      form.append(
        'source',
        await openAsBlob(archive.path, { type: 'application/gzip' }),
        'source.tar.gz',
      );

      if (keysPart) form.append('keys', keysPart);
      if (data !== undefined) form.append('data', String(data));

      return { method: 'POST', body: form };
    }),
  );

  await refusedApp(appId, response);

  if (!response.ok) throw await dojoStop(response, 'Dojo refused the upload');

  return ((await response.json()) as { deploymentId: string | number }).deploymentId;
}
