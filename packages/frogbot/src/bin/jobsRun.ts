import { Cron } from 'croner';
import type { Payload, PayloadRequest } from 'payload';

import { loadConfig } from '../config/load.js';
import type { FrogBot } from '../frogbot.js';
import type { JobsRunOptions } from './jobsRunOptions.js';
import { jobsRunUsage, parseJobsRunOptions } from './jobsRunOptions.js';

export async function jobsRun(args: string[]): Promise<void> {
  let options: JobsRunOptions;

  try {
    options = parseJobsRunOptions(args);
  } catch (error) {
    console.error(`FrogBot jobs:run: ${error instanceof Error ? error.message : String(error)}`);
    console.error(jobsRunUsage);

    process.exit(2);
  }

  if (options.help) {
    console.log(jobsRunUsage);

    process.exit(0);
  }

  let payload: Payload | undefined;
  let frogbot: FrogBot;

  let cron: Cron | undefined;
  let activeTick: Promise<void> | undefined;

  let stopping = false;
  let exitCode = 0;

  let resolveStopped!: () => void;
  const stopped = new Promise<void>((resolve) => {
    resolveStopped = resolve;
  });

  const keepAlive = setInterval(() => undefined, 60_000);

  const stop = () => {
    stopping = true;

    cron?.stop();
    resolveStopped();
  };

  const fail = (error: unknown) => {
    exitCode = 1;

    console.error(
      `FrogBot jobs:run failed: ${error instanceof Error ? error.message : String(error)}`,
    );

    stop();
  };

  const tick = () => {
    if (stopping || activeTick) return;

    activeTick = (async () => {
      const req = (await frogbot.createRequest()) as unknown as PayloadRequest;

      if (stopping) return;

      const selection = { allQueues: options.allQueues, queue: options.queue, req };

      if (options.handleSchedules) await frogbot.jobs.handleSchedules(selection);

      if (!stopping && options.limit > 0) {
        await frogbot.jobs.run({ ...selection, limit: options.limit });
      }
    })()
      .catch(fail)
      .finally(() => {
        activeTick = undefined;
      });

    return activeTick;
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  try {
    cron = new Cron(options.cron, { paused: true, protect: true, catch: fail }, tick);

    const config = await loadConfig({ cwd: process.cwd() });

    if (!stopping) {
      const payloadConfig = await config._internal.payloadConfig;

      payloadConfig.jobs = { ...payloadConfig.jobs, autoRun: [] };
      payloadConfig.logger = 'sync';

      const [{ BasePayload }, { initFrogBotFromPayload }, { seedFrogBotCache }] = await Promise.all(
        [import('payload'), import('../frogbot.js'), import('../getFrogBot.js')],
      );

      if (!stopping) {
        const runtime = new BasePayload();

        payload = runtime;

        await runtime.init({ config: payloadConfig, cron: false, disableOnInit: true });

        if (!stopping) {
          frogbot = await initFrogBotFromPayload(runtime, config, {
            startChannelGateway: false,
          });

          seedFrogBotCache(frogbot, config);
        }
      }
    }

    if (!stopping) cron.resume();

    await stopped;
  } catch (error) {
    fail(error);
  } finally {
    stop();

    await activeTick;

    try {
      await payload?.destroy();
    } catch (error) {
      fail(error);
    } finally {
      clearInterval(keepAlive);

      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
    }
  }

  process.exit(exitCode);
}
