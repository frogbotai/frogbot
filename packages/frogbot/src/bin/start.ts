// The `frogbot start` command.
// Boots the server without file watching (production-ready).

import { loadConfig } from '../config/load.js';
import { getFrogbot } from '../getFrogbot.js';
import { createServer } from '../server/create.js';
import { listen } from '../server/listen.js';

export async function start() {
  const port = parseInt(process.env.PORT ?? '3000', 10);
  const cwd = process.cwd();

  try {
    const config = await loadConfig(cwd);
    const frogbot = await getFrogbot({ config });

    const collections = Object.keys(frogbot.collections);
    frogbot.logger.info(`Connected to database`);
    frogbot.logger.info(`Collections: ${collections.join(', ')}`);

    const app = createServer(frogbot);
    const shutdown = await listen(app, port);

    frogbot.logger.info(`Ready on http://localhost:${port}`);
    frogbot.logger.info(`REST API: http://localhost:${port}/api`);

    // Graceful shutdown on SIGINT/SIGTERM
    const gracefulShutdown = async (signal: string) => {
      frogbot.logger.info(`Received ${signal}, shutting down...`);
      try {
        await shutdown();
        await frogbot.destroy();
        frogbot.logger.info('Shutdown complete');
        process.exit(0);
      } catch (err) {
        frogbot.logger.error(err as string, 'Error during shutdown');
        process.exit(1);
      }
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[frogbot] ${message}`);
    process.exit(1);
  }
}
