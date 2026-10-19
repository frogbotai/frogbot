import { ShareError } from '../error.js';
import type { ShareConfig, ShareIO } from '../io.js';
import { say } from '../io.js';
import type { DataInventory } from './inventory.js';
import { describeData, takeInventory } from './inventory.js';

/**
 * A first share's data: `data` is `--data` (true), `--no-data` (false) or neither. Asks with a TTY,
 * stops without one; nothing to count, or a database that can't be snapshotted, shares code only.
 * The caller disposes of the inventory it gets back.
 */
export async function askData({
  data,
  root,
  config,
  io,
}: {
  data: boolean | undefined;
  root: string;
  config: ShareConfig;
  io: ShareIO;
}): Promise<DataInventory | undefined> {
  if (data === false) return undefined;

  const inventory = await takeInventory({ root, config });

  if (inventory === 'unsupported') {
    say(
      io,
      '[frogbot] Your data stays on this computer: bringing data works only for SQLite apps for now.',
    );

    return undefined;
  }

  if (!inventory) return undefined;

  let brought = false;

  try {
    const summary = describeData(inventory);

    if (data === undefined && !io.isTTY) {
      throw new ShareError(
        `This first share can bring the local data (${summary}). Ask the person whether to bring it, then rerun with --data or --no-data.`,
      );
    }

    brought = data ?? (await io.prompts.confirm(`Bring your data? ${summary}`));

    return brought ? inventory : undefined;
  } finally {
    if (!brought) await inventory.dispose();
  }
}
