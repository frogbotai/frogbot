import { readFileSync, realpathSync } from 'node:fs';

import type { Tool, ToolExecutionOptions } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MCPConnections } from '../../../../packages/frogbot/src/mcp/connections.js';
import { mcpToolName, resolveMCPTools } from '../../../../packages/frogbot/src/mcp/tools.js';
import type { MCPServer } from '../../../../packages/frogbot/src/mcp/types.js';
import { FROGBOT_VERSION } from '../../../../packages/frogbot/src/version.js';
import { isRunning, type Scratch, scratch } from './fixture.js';

let fixture: Scratch;
let connections: MCPConnections;
const logger = { warn: vi.fn() };

beforeEach(async () => {
  fixture = await scratch();
  logger.warn.mockReset();
  connections = new MCPConnections(logger);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await connections.closeAll();
  await fixture.cleanup();
});

function resolve(
  servers: MCPServer[],
  {
    agent = 'researcher',
    reserved = new Set<string>(),
    abortSignal,
  }: { agent?: string; reserved?: Set<string>; abortSignal?: AbortSignal } = {},
) {
  return resolveMCPTools({ agent, servers, connections, reserved, abortSignal, logger });
}

function run(tool: Tool | undefined, input: unknown, abortSignal?: AbortSignal) {
  return tool!.execute!(input, {
    toolCallId: 'call-1',
    messages: [],
    abortSignal,
  } as unknown as ToolExecutionOptions<never>);
}

describe('MCP tools for a run', () => {
  it('names each tool <server>_<tool> with its description and JSON Schema', async () => {
    const tools = await resolve([fixture.server()]);

    expect(Object.keys(tools)).toEqual([
      'fixture_echo',
      'fixture_shot',
      'fixture_fail',
      'fixture_slow',
      'fixture_die',
      'fixture_look_up',
    ]);
    expect(tools.fixture_echo).toMatchObject({
      type: 'dynamic',
      description: 'Echo the text back',
    });
    expect(tools.fixture_fail.description).toBe('');
    expect(mcpToolName('sidekick', 'tabs.list')).toBe('sidekick_tabs_list');
  });

  it('calls a tool and turns results into text and file parts', async () => {
    const tools = await resolve([fixture.server()]);

    await expect(run(tools.fixture_echo, { text: 'hi' })).resolves.toMatchObject({
      content: [{ type: 'text', text: 'hi' }],
    });

    const shot = await run(tools.fixture_shot, {});

    expect(
      await tools.fixture_shot.toModelOutput!({ toolCallId: 'call-1', input: {}, output: shot }),
    ).toEqual({
      type: 'content',
      value: [
        { type: 'text', text: 'A screenshot' },
        { type: 'file', mediaType: 'image/png', data: { type: 'data', data: expect.any(String) } },
      ],
    });

    const failed = await run(tools.fixture_fail, {});

    expect(failed).toMatchObject({ isError: true });
    expect(
      await tools.fixture_fail.toModelOutput!({ toolCallId: 'call-1', input: {}, output: failed }),
    ).toEqual({ type: 'content', value: [{ type: 'text', text: 'Something broke' }] });
  });

  it('leaves out a tool whose name is taken, with one warning', async () => {
    const reserved = new Set(['fixture_echo']);

    expect(Object.keys(await resolve([fixture.server()], { reserved }))).not.toContain(
      'fixture_echo',
    );

    await resolve([fixture.server()], { reserved });

    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      "[frogbot] Agent 'researcher' leaves out MCP tool 'echo' from 'fixture': the name 'fixture_echo' is already taken.",
    );
  });

  it('sends the plain initialize handshake with the agent slug, never server/discover', async () => {
    await resolve([fixture.server()], { agent: 'support' });

    const [initialize] = fixture.entries().filter(({ message }) => message);

    expect(initialize.message).toMatchObject({
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        clientInfo: { name: 'support', version: FROGBOT_VERSION },
      },
    });
    expect(fixture.methods()).toEqual(['initialize', 'notifications/initialized', 'tools/list']);
    expect(FROGBOT_VERSION).toBe(
      JSON.parse(
        readFileSync(new URL('../../../../packages/frogbot/package.json', import.meta.url), 'utf8'),
      ).version,
    );
  });

  it('gives a local server the host environment, its own environment and cwd', async () => {
    vi.stubEnv('MCP_FIXTURE_HOST', 'host');

    await resolve([fixture.server({ cwd: fixture.dir, environment: { MCP_FIXTURE_ENV: 'own' } })]);

    const [start] = fixture.starts();

    expect(start.env).toEqual({ own: 'own', host: 'host' });
    expect(realpathSync(start.cwd!)).toBe(realpathSync(fixture.dir));
  });
});

describe('MCP connections', () => {
  it('keeps one connection per agent across runs', async () => {
    const server = fixture.server();

    await resolve([server], { agent: 'researcher' });
    await resolve([server], { agent: 'researcher' });
    await resolve([server], { agent: 'support' });

    const starts = fixture.starts();

    expect(starts).toHaveLength(2);
    expect(fixture.methods(starts[0].pid).filter((method) => method === 'tools/list')).toHaveLength(
      2,
    );
    expect(fixture.methods(starts[1].pid)[0]).toBe('initialize');
  });

  it('ends every local process on closeAll and opens nothing after', async () => {
    await resolve([fixture.server()], { agent: 'researcher' });
    await resolve([fixture.server()], { agent: 'support' });

    const pids = fixture.starts().map(({ pid }) => pid);

    expect(pids.every(isRunning)).toBe(true);

    await connections.closeAll();
    await vi.waitFor(() => expect(pids.some(isRunning)).toBe(false));

    expect(await resolve([fixture.server()])).toEqual({});
    expect(fixture.starts()).toHaveLength(2);
  });

  it('reopens a server that exited on the next run', async () => {
    const server = fixture.server();
    const tools = await resolve([server]);
    const [first] = fixture.starts();

    await expect(run(tools.fixture_die, {})).rejects.toThrow();

    await vi.waitFor(() => expect(isRunning(first.pid)).toBe(false));

    const again = await resolve([server]);

    expect(Object.keys(again)).toContain('fixture_echo');
    expect(fixture.starts()).toHaveLength(2);
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      "[frogbot] MCP server 'fixture' for agent 'researcher' exited (code 0); it starts again on the next run.",
    );
  });

  it('kills a server that ignores SIGTERM when it closes', async () => {
    await resolve([fixture.server({ environment: { MCP_FIXTURE_IGNORE_TERM: '1' } })]);

    const [start] = fixture.starts();

    await connections.closeAll();
    await vi.waitFor(() => expect(isRunning(start.pid)).toBe(false));

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('leaves out a server that fails to start, with one warning, and retries next run', async () => {
    const server = fixture.server({ command: ['frogbot-no-such-mcp-server'] });

    expect(await resolve([server, fixture.server({ name: 'other' })])).toHaveProperty('other_echo');
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(
        /^\[frogbot\] MCP server 'fixture' for agent 'researcher' is unavailable: .*ENOENT/,
      ),
    );

    await resolve([server]);

    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it('names the exit when a server quits before the handshake', async () => {
    await resolve([fixture.server({ command: [process.execPath, '-e', 'process.exit(7)'] })]);

    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      "[frogbot] MCP server 'fixture' for agent 'researcher' is unavailable: the server exited (code 7) before the handshake finished",
    );
  });

  it('gives up on a server that does not finish the handshake in time', async () => {
    const server = fixture.server({ hang: ['initialize'], timeout: { startup: 200 } });

    expect(await resolve([server])).toEqual({});
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      "[frogbot] MCP server 'fixture' for agent 'researcher' is unavailable: MCP client initialization timed out after 200ms",
    );

    const [start] = fixture.starts();

    await vi.waitFor(() => expect(isRunning(start.pid)).toBe(false));
  });

  it('closes a server that does not list its tools in time, and reopens it next run', async () => {
    const server = fixture.server({ hang: ['tools/list'], timeout: { catalog: 200 } });

    expect(await resolve([server])).toEqual({});
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      "[frogbot] MCP server 'fixture' for agent 'researcher' is unavailable: listing tools timed out after 200ms",
    );

    const [start] = fixture.starts();

    await vi.waitFor(() => expect(isRunning(start.pid)).toBe(false));
    await resolve([server]);

    expect(fixture.starts()).toHaveLength(2);
  });
});

describe('MCP tool calls', () => {
  it('cancels a call in flight when the turn stops', async () => {
    const tools = await resolve([fixture.server()]);
    const abort = new AbortController();
    const call = run(tools.fixture_slow, {}, abort.signal);

    abort.abort(new Error('Stopped'));

    await expect(call).rejects.toThrow();
  });

  it('stops a call that runs past timeout.execution', async () => {
    const tools = await resolve([fixture.server({ timeout: { execution: 200 } })]);
    const started = Date.now();

    await expect(run(tools.fixture_slow, {})).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('stops waiting for a server when the run is aborted', async () => {
    const abort = new AbortController();
    const pending = resolve([fixture.server({ hang: ['initialize'] })], {
      abortSignal: abort.signal,
    });

    abort.abort();

    await expect(pending).resolves.toEqual({});
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('keeps the connection when the run stops while it lists tools', async () => {
    const server = fixture.server({ hang: ['tools/list'] });
    const abort = new AbortController();
    const pending = resolve([server], { abortSignal: abort.signal });

    await vi.waitFor(() => expect(fixture.methods()).toContain('tools/list'));
    abort.abort();

    await expect(pending).resolves.toEqual({});

    const [start] = fixture.starts();

    expect(isRunning(start.pid)).toBe(true);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
