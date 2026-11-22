import nextEnvImport from '@next/env';

import type { FrogBotSanitizedConfig } from '../../config/sanitized.js';
import { formatCliError } from '../formatCliError.js';
import { processDeployIO } from './io.js';
import type { coreDeployTargetNames } from './names.js';
import { runDeploy } from './run.js';
import { awsTarget } from './targets/aws.js';
import { azureTarget } from './targets/azure.js';
import { dockerTarget } from './targets/docker.js';
import { flyTarget } from './targets/fly.js';
import { gcpTarget } from './targets/gcp.js';
import type { DeployIO, DeployTarget } from './types.js';

/** The targets core ships, named as in `coreDeployTargetNames`. */
export const coreDeployTargets: Record<(typeof coreDeployTargetNames)[number], DeployTarget> = {
  docker: dockerTarget,
  fly: flyTarget,
  gcp: gcpTarget,
  aws: awsTarget,
  azure: azureTarget,
};

const dojoPackage = '@frogbotai/plugin-dojo';

const sharedUsage = '[--dry-run] [--json] [--no-interactive] [--env-file <path>]';

function targetList(targets: Record<string, DeployTarget>, { flags = false } = {}): string {
  const width = Math.max(...Object.keys(targets).map((name) => name.length));

  return Object.entries(targets)
    .flatMap(([name, target]) => [
      `  ${name.padEnd(width)}  ${target.describe}`,
      ...(flags && target.usage ? [`${' '.repeat(width + 4)}${target.usage}`] : []),
    ])
    .join('\n');
}

type LoadedConfig = { config?: FrogBotSanitizedConfig; loadError?: unknown };

const allTargets = (config?: FrogBotSanitizedConfig): Record<string, DeployTarget> => ({
  ...config?.cli.deployTargets,
  ...coreDeployTargets,
});

/** What `frogbot deploy --help` prints: every target with its own flags, or, after a target's name, that target's. */
export function deployHelp(args: string[], { config, loadError }: LoadedConfig = {}): string {
  const targets = allTargets(config);
  const named = args[0]?.startsWith('-') ? undefined : args[0]?.toLowerCase();
  const target = named && Object.hasOwn(targets, named) ? targets[named] : undefined;

  if (named && target) {
    return `[frogbot] usage: frogbot deploy ${named} ${sharedUsage}${target.usage ? ` ${target.usage}` : ''}\n${target.describe}`;
  }

  return [
    `[frogbot] usage: frogbot deploy [target] ${sharedUsage} [target flags]`,
    Object.hasOwn(targets, 'dojo') ? 'With no target, deploys to dojo.' : undefined,
    loadError
      ? 'Targets that plugins add, such as dojo, load only with a working config.'
      : undefined,
    'Targets:',
    targetList(targets, { flags: true }),
  ]
    .filter(Boolean)
    .join('\n');
}

/** `frogbot deploy [target]`: runs a core target or one a plugin registered; no target means `dojo` when registered. */
export async function deploy(
  args: string[],
  {
    config,
    loadError,
    io,
  }: { config?: FrogBotSanitizedConfig; loadError?: unknown; io?: DeployIO } = {},
): Promise<number> {
  const targets = allTargets(config);
  const [first, ...rest] = args;
  const named = first && !first.startsWith('-') ? first.toLowerCase() : undefined;
  const name = named ?? (Object.hasOwn(targets, 'dojo') ? 'dojo' : undefined);
  const targetArgs = named ? rest : args;
  const target = name && Object.hasOwn(targets, name) ? targets[name] : undefined;
  const stderr = io?.stderr ?? process.stderr;

  if (!target || !name) {
    const pluginHint =
      name === 'dojo'
        ? `Add \`dojo()\` from \`${dojoPackage}\` to \`plugins\` in frogbot.config.ts.`
        : 'A target a plugin adds needs that plugin in `plugins` in frogbot.config.ts.';

    const issue = loadError
      ? {
          code: 'CONFIG_INVALID',
          message: formatCliError(loadError).replace(/^\[frogbot\] /, ''),
          fix: "Fix frogbot.config.ts and rerun; `frogbot check` shows what's wrong. Targets that plugins add load only with a working config.",
        }
      : {
          code: 'UNKNOWN_TARGET',
          message: name ? `"${name}" isn't a deploy target.` : 'No deploy target named.',
          fix:
            name === 'dojo'
              ? pluginHint
              : `Name one of: ${Object.keys(targets).join(', ')}. ${pluginHint}`,
        };

    if (loadError) stderr.write(`${formatCliError(loadError)}\n`);
    else {
      stderr.write(
        `${name ? `[frogbot] ${issue.message}\n` : ''}${name === 'dojo' ? `[frogbot] ${pluginHint}\n` : ''}[frogbot] usage: frogbot deploy <target> ${sharedUsage}\nTargets:\n${targetList(targets)}\n`,
      );
    }

    if (args.includes('--json')) {
      (io?.stdout ?? process.stdout).write(
        `${JSON.stringify({ target: name ?? null, ok: false, dryRun: args.includes('--dry-run'), issues: [issue], result: null })}\n`,
      );
    }

    return loadError ? 1 : 2;
  }

  const payloadConfig = async () => {
    if (config) return await config._internal.payloadConfig;

    throw loadError instanceof Error
      ? loadError
      : new Error('[frogbot] no frogbot.config.ts found');
  };

  const image = Object.hasOwn(coreDeployTargets, name);

  return runDeploy(target, targetArgs, io ?? realIO({ image, loadConfig: payloadConfig }), {
    name,
    image,
  });
}

function realIO({
  image,
  loadConfig,
}: {
  image: boolean;
  loadConfig: DeployIO['loadConfig'];
}): DeployIO {
  const io = processDeployIO({ program: 'frogbot', loadConfig });

  return image ? { ...io, env: nextEnvImport.initialEnv ?? process.env } : io;
}
