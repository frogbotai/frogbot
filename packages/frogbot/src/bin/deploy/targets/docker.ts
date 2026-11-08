import { appSlug, parseTargetArgs, sourceTag, usesFileDatabase } from '../app.js';
import { findTool } from '../preflight.js';
import type { DeployTarget } from '../types.js';

const usage = '[--tag <tag>]';

/** `frogbot deploy docker`: builds the app's image locally and prints how to run it. Never pushes. */
export const dockerTarget: DeployTarget = {
  describe: 'Build a Docker image of the app on this computer (no push)',
  preflight: async (context) => {
    parseTargetArgs(context, { target: 'docker', usage, options: { tag: { type: 'string' } } });

    const { issue } = await findTool(
      context.io,
      ['docker'],
      'Install Docker: https://docs.docker.com/get-docker/',
    );

    if (issue) return [issue];

    const { code } = await context.io.exec('docker', ['info']);

    if (code === 0) return [];

    return [
      {
        code: 'NOT_LOGGED_IN',
        message: "Docker isn't running.",
        fix: 'Start Docker Desktop (or `sudo systemctl start docker`), then run this again.',
      },
    ];
  },
  run: async (context) => {
    const { tag } = parseTargetArgs(context, {
      target: 'docker',
      usage,
      options: { tag: { type: 'string' } },
    });

    const image = `${appSlug(context.root)}:${tag ?? sourceTag(context.root)}`;

    await context.run('docker', ['build', '-t', image, '.']);

    const database = usesFileDatabase(context)
      ? ' -v frogbot-data:/data -e DATABASE_URL=file:/data/frogbot.db'
      : '';

    const runLine = `docker run -p 3000:3000 --env-file .env${database} ${image}`;

    if (!context.flags.dryRun) {
      context.log(`[frogbot] Built ${image}. Run it with:`);
      context.log(runLine);
    }

    return { image, run: runLine };
  },
};
