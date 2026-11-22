import * as p from '@clack/prompts';
import type { DeployConfig } from 'frogbot';

import { ShareError } from '../error.js';
import type { DojoIO } from '../io.js';
import type { DataInventory } from './inventory.js';
import { describeData, takeInventory } from './inventory.js';

/** Asks for typed text: `io.prompts.text` when the terminal gives one, else the real prompt. */
export type TextPrompt = (message: string) => Promise<string>;

const clackText: TextPrompt = async (message) => {
  const answer = await p.text({ message });

  if (typeof answer === 'symbol') throw new ShareError('Cancelled.');

  return answer;
};

export const replaceMessages = {
  editor: "Only this app's Admins can replace its live data.",
  noTerminal:
    'Replacing live data needs a person at a terminal, or --confirm <app-slug> to answer the prompt.',
  unsupported: 'Replacing live data works only for SQLite apps for now.',
  nothing: "There's no local data to bring, so nothing was replaced.",
  firstShareOnly:
    "Data comes only with the first deploy. To replace the live data with this computer's, rerun with --replace-data.",
} as const;

/**
 * `frogbot deploy --replace-data` on a started app: an owner's local data, once the app's slug is typed to confirm,
 * at the prompt or as `--confirm <app-slug>`. A wrong `--confirm`, or none without a terminal, stops before the
 * inventory and any upload; `--yes` never answers it. The caller disposes of the inventory it gets back.
 */
export async function askReplace({
  slug,
  level,
  root,
  config,
  confirm,
  io,
}: {
  slug: string;
  level: 'editor' | 'owner';
  root: string;
  config: DeployConfig;
  /** `--confirm`: the typed slug, given as a flag. */
  confirm?: string;
  io: DojoIO;
}): Promise<DataInventory> {
  if (level === 'editor') throw new ShareError(replaceMessages.editor);

  if (confirm !== undefined && confirm.trim() !== slug) {
    throw new ShareError(`--confirm is "${confirm.trim()}", not ${slug}; nothing was replaced.`);
  }

  if (confirm === undefined && !io.isTTY) throw new ShareError(replaceMessages.noTerminal);

  const inventory = await takeInventory({ root, config });

  if (inventory === 'unsupported') throw new ShareError(replaceMessages.unsupported);
  if (!inventory) throw new ShareError(replaceMessages.nothing);
  if (confirm !== undefined) return inventory;

  let confirmed = false;
  try {
    const text = (io.prompts as { text?: TextPrompt }).text ?? clackText;
    const answer = await text(
      `This replaces all of ${slug}'s live data with this computer's (${describeData(inventory)}). Anything written live since will be lost. Type ${slug} to confirm:`,
    );

    confirmed = answer.trim() === slug;

    if (!confirmed) {
      throw new ShareError(`You typed "${answer.trim()}", not ${slug}; nothing was replaced.`);
    }

    return inventory;
  } finally {
    if (!confirmed) await inventory.dispose();
  }
}
