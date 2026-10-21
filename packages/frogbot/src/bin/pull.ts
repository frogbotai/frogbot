import { processIO } from './share/io.js';
import { runPull } from './share/pull.js';

/** `frogbot pull <app>`: downloads an app shared with you from Dojo into a new folder. */
export async function pull(args: string[]): Promise<void> {
  process.exitCode = await runPull(args, processIO());
}
