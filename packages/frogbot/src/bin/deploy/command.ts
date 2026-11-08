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

const sharedUsage = '[--dry-run] [--json] [--no-interactive] [--env-file <path>]';

function targetList(targets: Record<string, DeployTarget>): string {
  const width = Math.max(...Object.keys(targets).map((name) => name.length));

  return Object.entries(targets)
    .map(([name, target]) => `  ${name.padEnd(width)}  ${target.describe}`)
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
  const plugins = config?.cli.deployTargets ?? {};
  const targets: Record<string, DeployTarget> = { ...plugins, ...coreDeployTargets };
  const [first, ...rest] = args;
  const named = first && !first.startsWith('-') ? first.toLowerCase() : undefined;
  const name = named ?? (Object.hasOwn(targets, 'dojo') ? 'dojo' : undefined);
  const targetArgs = named ? rest : args;
  const target = name && Object.hasOwn(targets, name) ? targets[name] : undefined;
  const stderr = io?.stderr ?? process.stderr;

  if (!target || !name) {
    const message = name ? `"${name}" isn't a deploy target.` : 'No deploy target named.';

    if (loadError) stderr.write(`${formatCliError(loadError)}\n`);

    stderr.write(
      `${name ? `[frogbot] ${message}\n` : ''}[frogbot] usage: frogbot deploy <target> ${sharedUsage}\nTargets:\n${targetList(targets)}\n`,
    );

    if (args.includes('--json')) {
      const issue = {
        code: 'UNKNOWN_TARGET',
        message,
        fix: `Name one of: ${Object.keys(targets).join(', ')}.`,
      };

      (io?.stdout ?? process.stdout).write(
        `${JSON.stringify({ target: name ?? null, ok: false, dryRun: args.includes('--dry-run'), issues: [issue], result: null })}\n`,
      );
    }

    return 2;
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
