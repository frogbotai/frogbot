import { processIO } from './share/io.js';
import { runLogs } from './share/logs.js';

/** `frogbot logs <app>`: prints an app's recent logs from Dojo, or follows them with `--follow`. */
export async function logs(args: string[]): Promise<void> {
  process.exitCode = await runLogs(args, processIO());
}
