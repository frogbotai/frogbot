import { parseArgs } from 'node:util';

import { ShareError } from './error.js';

const usage = (program: string) =>
  `Usage: ${/dojo$/.test(program) ? `${program} apps share` : `${program} deploy dojo`} [--app <slug or id>] [--data | --no-data] [--workspace <slug>] [--name <name>] [--no-keys] [--skip-key <NAME>]... [--yes] [--update-keys]`;

/** `share`'s own flags. */
export type ShareFlags = {
  app?: string;
  data?: boolean;
  workspace?: string;
  name?: string;
  keys: boolean;
  skipKey: string[];
  yes: boolean;
  updateKeys: boolean;
};

/** Parses `share`'s flags; a bad one stops with the usage line and exit code 2. */
export function parseShareArgs(argv: string[], program: string): ShareFlags {
  let parsed;

  try {
    parsed = parseArgs({
      args: argv,
      options: {
        app: { type: 'string' },
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
    throw new ShareError(`${(error as Error).message} ${usage(program)}`, 2);
  }

  const dataFlags = new Set(
    parsed.tokens.flatMap((token) =>
      token.kind === 'option' && token.name === 'data' ? [token.rawName] : [],
    ),
  );

  if (dataFlags.size > 1) {
    throw new ShareError(`Use --data or --no-data, not both. ${usage(program)}`, 2);
  }

  const { values } = parsed;

  if (values.app !== undefined && !values.app.trim()) {
    throw new ShareError(`--app needs an app's slug or id. ${usage(program)}`, 2);
  }

  if (values.app !== undefined && (values.workspace !== undefined || values.name !== undefined)) {
    throw new ShareError(
      `--app shares to an app that already exists; --workspace and --name are for a new one. ${usage(program)}`,
      2,
    );
  }

  return {
    app: values.app,
    data: values.data,
    workspace: values.workspace,
    name: values.name,
    keys: values.keys,
    skipKey: values['skip-key'],
    yes: values.yes,
    updateKeys: values['update-keys'],
  };
}
