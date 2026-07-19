import { describe, it } from 'vitest';

describe('frogbot start command', () => {
  it.todo('composes the pipeline in order: loadConfig \u2192 getPayload \u2192 createServer \u2192 listen');
  it.todo('defaults to port 3000 when PORT is unset');
  it.todo('honors the PORT env override');
  it.todo('logs the connected collections list after boot');
  it.todo('logs `Ready on http://localhost:<port>` once listening');
  it.todo('registers SIGINT and SIGTERM handlers that shut down gracefully');
  it.todo('graceful shutdown closes the server, calls payload.destroy(), and exits 0');
  it.todo('graceful shutdown logs the error and exits 1 when shutdown throws');
  it.todo('logs `[frogbot] <message>` and exits 1 when boot fails');
  it.todo('calls payload.getPayload({ config }) and returns its resolved instance');
  it.todo('surfaces getPayload init errors verbatim (the CLI command prefixes them with `[frogbot]`)');
});
