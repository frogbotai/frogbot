import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import ignore from 'ignore';

import { ShareError } from './error.js';

/** The Dojo app a folder shares to, from `.frogbot/app.json`. */
export type AppLink = { appId: string | number };

export const linkPath = '.frogbot/app.json';

/** The app's link, or `undefined` on a first share. */
export async function readLink(root: string): Promise<AppLink | undefined> {
  let text: string;

  try {
    text = await readFile(join(root, linkPath), 'utf8');
  } catch {
    return undefined;
  }

  const link = parseJSON(text) as Partial<AppLink> | undefined;

  if (typeof link?.appId !== 'string' && typeof link?.appId !== 'number') {
    throw new ShareError(`${linkPath} has no appId. Delete it to share as a new app.`);
  }

  return { appId: link.appId };
}

function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Writes `.frogbot/app.json` and adds `/.frogbot` to `.gitignore` unless a line already covers it. */
export async function writeLink(root: string, link: AppLink): Promise<void> {
  await mkdir(join(root, '.frogbot'), { recursive: true });
  await writeFile(join(root, linkPath), `${JSON.stringify(link, null, 2)}\n`);

  const gitignorePath = join(root, '.gitignore');
  const gitignore = await readFile(gitignorePath, 'utf8').catch(() => '');

  if (ignore().add(gitignore).ignores('.frogbot/')) return;

  const separator = gitignore && !gitignore.endsWith('\n') ? '\n' : '';

  await writeFile(gitignorePath, `${gitignore}${separator}/.frogbot\n`);
}
