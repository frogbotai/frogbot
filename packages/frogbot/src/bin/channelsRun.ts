import type { Payload } from 'payload';

import { getChannelHost } from '../channels/host.js';
import { loadConfig } from '../config/load.js';
import type { Frogbot } from '../frogbot.js';

export async function channelsRun(): Promise<void> {
  let payload: Payload | undefined;
  let frogbot: Frogbot | undefined;
  const controller = new AbortController();
  let exitCode = 0;

  const stop = () => controller.abort();

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  try {
    const config = await loadConfig({ cwd: process.cwd() });
    const payloadConfig = await config._internal.payloadConfig;
    const [{ BasePayload }, { initFrogbotFromPayload }] = await Promise.all([
      import('payload'),
      import('../frogbot.js'),
    ]);
    const runtime = new BasePayload();

    payload = runtime;

    await runtime.init({ config: payloadConfig, cron: false, disableOnInit: true });

    frogbot = await initFrogbotFromPayload(runtime, config, { startChannelGateway: false });
    const host = getChannelHost(frogbot);

    if (!host?.hasGatewayAdapters()) {
      console.log('FrogBot channels:run: no gateway channel adapters configured.');
    } else {
      while (!controller.signal.aborted) {
        const ran = await host.runGatewayListener({
          durationMs: 10 * 60_000,
          signal: controller.signal,
        });

        if (!ran) {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 5000);

            controller.signal.addEventListener(
              'abort',
              () => {
                clearTimeout(timer);
                resolve();
              },
              { once: true },
            );
          });
        }
      }
    }
  } catch (error) {
    exitCode = 1;

    console.error(
      `FrogBot channels:run failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    try {
      if (frogbot) await frogbot.destroy();
      else await payload?.destroy();
    } catch (error) {
      exitCode = 1;

      console.error(
        `FrogBot channels:run failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }

  process.exit(exitCode);
}
