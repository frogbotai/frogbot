import { ChildProcess } from 'node:child_process';

import type { MCPClient, MCPTransport } from '@ai-sdk/mcp';
import { createMCPClient } from '@ai-sdk/mcp';
import { Experimental_StdioMCPTransport as StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio';

import type { Logger } from '../frogbot.js';
import { FROGBOT_VERSION } from '../version.js';
import type { MCPServer } from './types.js';

export const DEFAULT_STARTUP_TIMEOUT = 30_000;

/** One client per agent and server, opened on first use and kept across runs. */
export class MCPConnections {
  readonly #clients = new Map<string, Promise<MCPClient>>();
  readonly #logger: Pick<Logger, 'warn'>;
  readonly #warned = new Set<string>();
  readonly #closing = new AbortController();

  constructor(logger: Pick<Logger, 'warn'>) {
    this.#logger = logger;
  }

  get(agent: string, server: MCPServer): Promise<MCPClient> {
    if (this.#closing.signal.aborted) {
      return Promise.reject(new Error('MCP connections are closed'));
    }

    const key = `${agent}\0${server.name}`;
    const existing = this.#clients.get(key);

    if (existing) return existing;

    const opening = this.#open(agent, server, () => this.#drop(key, opening));

    this.#clients.set(key, opening);
    opening.catch(() => this.#drop(key, opening));

    return opening;
  }

  /** Closes a client that failed, so the next run opens a new one. */
  async discard(agent: string, server: MCPServer, client: MCPClient): Promise<void> {
    const key = `${agent}\0${server.name}`;
    const current = this.#clients.get(key);

    if (current && (await current.catch(() => undefined)) === client) this.#drop(key, current);

    await client.close().catch(() => {});
  }

  async closeAll(): Promise<void> {
    this.#closing.abort();

    const clients = [...this.#clients.values()];

    this.#clients.clear();

    await Promise.allSettled(clients.map(async (client) => (await client).close()));
  }

  #drop(key: string, client: Promise<MCPClient>) {
    if (this.#clients.get(key) === client) this.#clients.delete(key);
  }

  warnOnce(key: string, message: string): void {
    if (this.#warned.has(key)) return;

    this.#warned.add(key);
    this.#logger.warn(message);
  }

  async #open(agent: string, server: MCPServer, onClose: () => void): Promise<MCPClient> {
    let connected = false;
    let exitedWith: string | undefined;

    const transport =
      server.type === 'local'
        ? watchProcess(
            new StdioMCPTransport({
              command: server.command[0],
              args: server.command.slice(1),
              env: { ...hostEnvironment(), ...server.environment },
              ...(server.cwd !== undefined ? { cwd: server.cwd } : {}),
            }),
            (exit) => {
              exitedWith = exit;
              onClose();

              if (exit && connected) {
                this.#logger.warn(
                  `[frogbot] MCP server '${server.name}' for agent '${agent}' exited (${exit}); it starts again on the next run.`,
                );
              }
            },
          )
        : { type: 'http' as const, url: server.url, headers: server.headers };

    try {
      const client = await createMCPClient({
        transport,
        protocolVersionDiscovery: false,
        clientName: agent,
        version: FROGBOT_VERSION,
        initializationOptions: {
          signal: this.#closing.signal,
          timeout: server.timeout?.startup ?? DEFAULT_STARTUP_TIMEOUT,
        },
      });

      connected = true;

      return client;
    } catch (error) {
      if (exitedWith) {
        throw new Error(`the server exited (${exitedWith}) before the handshake finished`);
      }

      throw error;
    }
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const FORCE_KILL_AFTER = 2_000;

function watchProcess(
  transport: MCPTransport,
  onClose: (exit: string | undefined) => void,
): MCPTransport {
  const start = transport.start.bind(transport);
  const close = transport.close.bind(transport);
  let child: ChildProcess | undefined;
  let closing = false;

  transport.start = async () => {
    const clientClose = transport.onclose;

    transport.onclose = () => {
      onClose(closing || !child ? undefined : exitOf(child));

      clientClose?.();
    };

    const started = start();

    child = childOf(transport);

    await started;
  };

  transport.close = async () => {
    closing = true;

    await close();

    if (child && !(await waitForExit(child, FORCE_KILL_AFTER))) child.kill('SIGKILL');
  };

  return transport;
}

function childOf(transport: MCPTransport): ChildProcess | undefined {
  const value: unknown = Reflect.get(transport, 'process');

  return value instanceof ChildProcess ? value : undefined;
}

function exitOf(child: ChildProcess): string {
  return child.signalCode ? `signal ${child.signalCode}` : `code ${child.exitCode}`;
}

function waitForExit(child: ChildProcess, ms: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.off('exit', done);
      resolve(false);
    }, ms);

    function done() {
      clearTimeout(timer);
      resolve(true);
    }

    child.once('exit', done);
  });
}

function hostEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}
