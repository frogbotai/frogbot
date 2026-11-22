import { parseArgs } from 'node:util';

import { ShareError } from './error.js';

/**
 * The `dojo` target's flags: what `parseArgs` takes and what the usage line shows, from one table so they can't
 * drift; `parseArgs` ignores `value` and `shown`. `shown` replaces the usage text of a flag that has forms, like
 * `--data | --no-data`.
 */
export const shareOptions = {
  app: { type: 'string', value: 'slug or id' },
  data: { type: 'boolean', shown: '--data | --no-data | --replace-data' },
  'replace-data': { type: 'boolean', default: false, shown: '' },
  confirm: { type: 'string', value: 'app-slug' },
  workspace: { type: 'string', value: 'slug' },
  name: { type: 'string', value: 'name' },
  keys: { type: 'boolean', default: true, shown: '--no-keys' },
  'skip-key': { type: 'string', multiple: true, default: [] as string[], value: 'NAME' },
  yes: { type: 'boolean', default: false },
  'update-keys': { type: 'boolean', default: false },
  wait: { type: 'boolean', default: false },
} as const;

function shownFlag(name: string, option: (typeof shareOptions)[keyof typeof shareOptions]) {
  const text =
    'shown' in option ? option.shown : `--${name}${'value' in option ? ` <${option.value}>` : ''}`;

  return text ? `[${text}]${'multiple' in option ? '...' : ''}` : '';
}

/** `frogbot deploy dojo`'s usage line, listing every flag `parseShareArgs` accepts. */
export const shareUsage = (program: string) =>
  [
    `Usage: ${program} deploy [dojo]`,
    ...Object.entries(shareOptions).map(([name, option]) => shownFlag(name, option)),
  ]
    .filter(Boolean)
    .join(' ');

/** The `dojo` deploy target's own flags. */
export type ShareFlags = {
  app?: string;
  data?: boolean;
  replaceData: boolean;
  /** `--confirm <app-slug>`: answers `--replace-data`'s typed confirmation, so an agent can replace live data. */
  confirm?: string;
  workspace?: string;
  name?: string;
  keys: boolean;
  skipKey: string[];
  yes: boolean;
  updateKeys: boolean;
  /** Wait for a sign-in or a payment without a terminal, instead of exiting 3 or 4 with its link. */
  wait: boolean;
};

/** Parses the `dojo` target's flags; a bad one stops with the usage line and exit code 2. */
export function parseShareArgs(argv: string[], program: string): ShareFlags {
  let parsed;

  try {
    parsed = parseArgs({
      args: argv,
      options: shareOptions,
      allowNegative: true,
      strict: true,
      tokens: true,
    });
  } catch (error) {
    throw new ShareError(`${(error as Error).message} ${shareUsage(program)}`, 2);
  }

  const dataFlags = new Set(
    parsed.tokens.flatMap((token) =>
      token.kind === 'option' && token.name === 'data' ? [token.rawName] : [],
    ),
  );

  if (dataFlags.size > 1) {
    throw new ShareError(`Use --data or --no-data, not both. ${shareUsage(program)}`, 2);
  }

  const { values } = parsed;

  if (values['replace-data'] && values.data === false) {
    throw new ShareError(`Use --replace-data or --no-data, not both. ${shareUsage(program)}`, 2);
  }

  if (values.confirm !== undefined && !values['replace-data']) {
    throw new ShareError(
      `--confirm answers --replace-data; use them together. ${shareUsage(program)}`,
      2,
    );
  }

  if (values.app !== undefined && !values.app.trim()) {
    throw new ShareError(`--app needs an app's slug or id. ${shareUsage(program)}`, 2);
  }

  if (values.app !== undefined && (values.workspace !== undefined || values.name !== undefined)) {
    throw new ShareError(
      `--app shares to an app that already exists; --workspace and --name are for a new one. ${shareUsage(program)}`,
      2,
    );
  }

  return {
    app: values.app,
    data: values.data,
    replaceData: values['replace-data'],
    confirm: values.confirm,
    workspace: values.workspace,
    name: values.name,
    keys: values.keys,
    skipKey: values['skip-key'],
    yes: values.yes,
    updateKeys: values['update-keys'],
    wait: values.wait,
  };
}
