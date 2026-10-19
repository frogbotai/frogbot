import { processIO } from './share/io.js';
import { runShare } from './share/run.js';

/** `frogbot share`: ships the app in this folder to Dojo and prints its live URL. */
export async function share(args: string[]): Promise<void> {
  process.exitCode = await runShare(args, processIO());
}
