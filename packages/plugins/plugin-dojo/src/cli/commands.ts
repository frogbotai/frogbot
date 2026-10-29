import type { ShareIO } from './io.js';
import { processIO } from './io.js';

type Run = (args: string[], io: ShareIO) => Promise<number>;

const commands = {
  share: async () => (await import('./run.js')).runShare,
  pull: async () => (await import('./pull.js')).runPull,
  logs: async () => (await import('./logs.js')).runLogs,
  logout: async () => (await import('./logout.js')).runLogout,
} satisfies Record<string, () => Promise<Run>>;

/** A command `dojo()` adds to an app. */
export type DojoCommandName = keyof typeof commands;

/** The commands `dojo()` adds to an app and `npx @frogbotai/plugin-dojo` runs anywhere. */
export const dojoCommandNames = Object.keys(commands) as DojoCommandName[];

/** Runs one Dojo command against the real terminal and sets `process.exitCode`. */
export async function runDojoCommand(
  name: DojoCommandName,
  args: string[],
  program: string,
): Promise<void> {
  const run: Run = await commands[name]();

  process.exitCode = await run(args, processIO(program));
}
