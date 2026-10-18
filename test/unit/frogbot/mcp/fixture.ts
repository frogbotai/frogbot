import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mcpServer } from '../../../../packages/frogbot/src/mcp/server.js';
import type {
  MCPServer,
  MCPServerLocalOptions,
} from '../../../../packages/frogbot/src/mcp/types.js';

export const FIXTURE = fileURLToPath(new URL('./fixtures/server.mjs', import.meta.url));

export type LogEntry = {
  pid: number;
  event?: 'start';
  cwd?: string;
  env?: { own?: string; host?: string };
  message?: { method?: string; id?: number; params?: Record<string, unknown> };
};

export type Scratch = {
  dir: string;
  server: (options?: Partial<MCPServerLocalOptions> & { hang?: string[] }) => MCPServer;
  entries: () => LogEntry[];
  starts: () => LogEntry[];
  methods: (pid?: number) => string[];
  cleanup: () => Promise<void>;
};

export async function scratch(): Promise<Scratch> {
  const dir = await mkdtemp(join(tmpdir(), 'frogbot-mcp-'));
  const log = join(dir, 'requests.jsonl');

  const entries = () =>
    existsSync(log)
      ? readFileSync(log, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line) as LogEntry)
      : [];

  return {
    dir,
    server: ({ hang, environment, ...options } = {}) =>
      mcpServer({
        name: 'fixture',
        type: 'local',
        command: [process.execPath, FIXTURE],
        environment: {
          MCP_FIXTURE_LOG: log,
          ...(hang ? { MCP_FIXTURE_HANG: hang.join(',') } : {}),
          ...environment,
        },
        ...options,
      }),
    entries,
    starts: () => entries().filter(({ event }) => event === 'start'),
    methods: (pid) =>
      entries()
        .filter((entry) => entry.message && (pid === undefined || entry.pid === pid))
        .map(({ message }) => message!.method ?? 'response'),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

export function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);

    return true;
  } catch {
    return false;
  }
}
