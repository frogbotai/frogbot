import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type * as AI from 'ai';
import type * as Gateway from '@frogbotai/gateway';

import type { SanitizedAIConfig } from '../types/ai.js';
import type { FrogbotRequest } from '../types/request.js';

const agentState = vi.hoisted(() => ({
  prepared: undefined as Record<string, unknown> | undefined,
  streamCall: undefined as Record<string, unknown> | undefined,
}));

vi.mock('ai', async (importOriginal) => {
  const original = await importOriginal<typeof AI>();
  type MockSettings = Record<string, unknown> & {
    prepareCall: (call: Record<string, unknown>) => Promise<Record<string, unknown>>;
    tools: unknown;
  };
  return {
    ...original,
    ToolLoopAgent: class {
      readonly settings: MockSettings;

      constructor(settings: MockSettings) {
        this.settings = settings;
      }

      get tools() {
        return this.settings.tools;
      }

      async generate(call: Record<string, unknown>) {
        agentState.prepared = await this.settings.prepareCall({ ...this.settings, ...call });
        return {
          text: 'ok',
          finishReason: 'stop',
          rawFinishReason: 'stop',
          usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 },
          totalUsage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 },
          steps: [{ content: [{ type: 'text', text: 'ok' }] }],
        };
      }

      async stream(call: Record<string, unknown>) {
        agentState.prepared = await this.settings.prepareCall({ ...this.settings, ...call });
        agentState.streamCall = call;
        return {};
      }
    },
  };
});

vi.mock('@frogbotai/gateway', async (importOriginal) => ({
  ...(await importOriginal<typeof Gateway>()),
  runHooks: async <T>(
    hooks: Array<(args: T) => void | Promise<void>> | undefined,
    args: T,
    options?: { isolate?: boolean },
  ) => {
    for (const hook of hooks ?? []) {
      if (!options?.isolate) {
        await hook(args);
        continue;
      }
      try {
        await hook(args);
      } catch {
        continue;
      }
    }
  },
}));

const { createAgentInstance } = await import('./instance.js');

function makeConfig(hooks: SanitizedAIConfig['hooks']): SanitizedAIConfig {
  return {
    providers: { openai: { apiKey: 'test' } },
    routers: {},
    hooks,
    access: {
      generate: () => true,
      embed: () => true,
      transcribe: () => true,
      rerank: () => true,
    },
    telemetry: { enabled: false },
    _internal: { deploymentId: 'test' },
  };
}

function emptyHooks(): SanitizedAIConfig['hooks'] {
  return {
    beforeOperation: [],
    beforeUpstream: [],
    afterUpstream: [],
    afterError: [],
    afterOperation: [],
  };
}

function makeDeps(config: SanitizedAIConfig, req: FrogbotRequest) {
  // Mirrors the gateway's operation lifecycle: hooks receive top-level
  // req/user/agent lifted from the seeded context (as toGatewayHooks does in prod).
  const lift = (context: Record<string, unknown>) => {
    const seed = context as { req?: FrogbotRequest; agent?: unknown };
    return { req: seed.req, user: seed.req?.user, agent: seed.agent };
  };
  const runHooks = async (
    hooks: Array<(args: unknown) => void | Promise<void>> | undefined,
    args: Record<string, unknown>,
    context: Record<string, unknown>,
  ) => {
    for (const hook of hooks ?? []) {
      await hook({ ...args, ...lift(context) });
    }
  };
  const operation = vi.fn((opts: { operation: string; model: string; context?: Record<string, unknown> }) => {
    const requestId = `req_${Math.random().toString(36).slice(2)}`;
    const context = opts.context ?? {};
    let finished = false;
    return {
      requestId,
      context,
      start: async () => {
        await runHooks(
          config.hooks?.beforeOperation as never,
          { phase: 'beforeOperation', operation: opts.operation, requestId },
          context,
        );
      },
      finish: async (result?: { finishReason?: string; usage?: unknown; error?: unknown }) => {
        if (finished) return;
        finished = true;
        await runHooks(
          config.hooks?.afterOperation as never,
          {
            phase: 'afterOperation',
            operation: opts.operation,
            requestId,
            finishReason: result?.finishReason,
            usage: result?.usage,
            error: result?.error,
          },
          context,
        );
      },
      chatModel: () => ({}),
    };
  });
  const frogbot = {
    config: { chat: { enabled: true, threadsSlug: 'threads', messagesSlug: 'messages' } },
    create: vi.fn(() => Promise.resolve({ id: 'message-1' })),
    find: vi.fn(() =>
      Promise.resolve({ docs: [{ id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }] }),
    ),
    findByID: vi.fn(() => Promise.resolve({ id: 'thread-1' })),
    update: vi.fn(() => Promise.resolve({ id: 'thread-1' })),
    createRequest: vi.fn(() => {
      Object.assign(req, { frogbot });
      return Promise.resolve(req);
    }),
  };
  return {
    gateway: { chatModel: vi.fn(() => ({})), operation },
    config,
    frogbot,
  } as never;
}

describe('agent hook lifecycle', () => {
  it('uses one stable run ID for hooks and agent runtime context', async () => {
    const beforeOperation = vi.fn();
    const afterOperation = vi.fn();
    const hooks = emptyHooks();
    hooks.beforeOperation.push(beforeOperation);
    hooks.afterOperation.push(afterOperation);
    const config = makeConfig(hooks);
    const req = { user: { id: 'user-1' } } as FrogbotRequest;
    const tool = {
      slug: 'lookup',
      description: 'Look up data',
      inputSchema: z.object({ query: z.string() }),
      execute: vi.fn(),
    };
    const agent = createAgentInstance(
      { slug: 'support', model: 'openai/test', instructions: 'Help', tools: [tool] },
      makeDeps(config, req),
    );

    await agent.generate({ prompt: 'Hello' });

    const runtimeContext = agentState.prepared?.runtimeContext as {
      agent: { slug: string; runId: string };
    };
    expect(beforeOperation).toHaveBeenCalledWith(expect.objectContaining({
      req,
      user: req.user,
      agent: runtimeContext.agent,
    }));
    expect(runtimeContext.agent.slug).toBe('support');
    const toolsContext = agentState.prepared?.toolsContext as Record<
      string,
      { agent: { slug: string; runId: string } }
    >;
    expect(toolsContext.lookup.agent).toEqual(
      runtimeContext.agent,
    );
    expect(afterOperation).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      agent: runtimeContext.agent,
      finishReason: 'stop',
      usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 },
    }));
  });

  it('finalizes a stream once when terminal callbacks repeat', async () => {
    const afterOperation = vi.fn();
    const hooks = emptyHooks();
    hooks.afterOperation.push(afterOperation);
    const config = makeConfig(hooks);
    const req = { user: { id: 'user-1' } } as FrogbotRequest;
    const agent = createAgentInstance(
      { slug: 'support', model: 'openai/test', instructions: 'Help' },
      makeDeps(config, req),
    );

    await agent.aiAgent.stream({
      prompt: 'Hello',
      options: { req, overrideAccess: false },
    });
    expect(afterOperation).not.toHaveBeenCalled();

    const onEnd = agentState.streamCall?.onEnd as (event: unknown) => Promise<void>;
    await onEnd({
      finishReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    });
    await onEnd({
      finishReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    });

    expect(afterOperation).toHaveBeenCalledOnce();
  });

  it('finalizes a stream that aborts before the first step completes', async () => {
    const afterOperation = vi.fn();
    const hooks = emptyHooks();
    hooks.afterOperation.push(afterOperation);
    const config = makeConfig(hooks);
    const req = { user: { id: 'user-1' } } as FrogbotRequest;
    const agent = createAgentInstance(
      { slug: 'support', model: 'openai/test', instructions: 'Help' },
      makeDeps(config, req),
    );
    const controller = new AbortController();

    await agent.aiAgent.stream({
      prompt: 'Hello',
      options: { req, overrideAccess: false },
      abortSignal: controller.signal,
    });
    controller.abort(new Error('cancelled'));

    await vi.waitFor(() => {
      expect(afterOperation).toHaveBeenCalledOnce();
    });
    expect(afterOperation).toHaveBeenCalledWith(
      expect.objectContaining({ finishReason: 'abort', error: expect.any(Error) }),
    );
  });

  it('persists local generate calls only when a threadId is supplied', async () => {
    const config = makeConfig(emptyHooks());
    const req = { user: { id: 'user-1' }, payload: { db: {} } } as unknown as FrogbotRequest;
    const deps = makeDeps(config, req) as unknown as {
      frogbot: {
        create: ReturnType<typeof vi.fn>;
        findByID: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
      };
    };
    const agent = createAgentInstance(
      { slug: 'support', model: 'openai/test', instructions: 'Help' },
      deps as never,
    );

    await agent.generate({ prompt: 'Stateless', req });
    expect(deps.frogbot.create).not.toHaveBeenCalled();

    await agent.generate({ prompt: 'Hello', threadId: 'thread-1', req, overrideAccess: false });

    expect(deps.frogbot.findByID).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'threads', id: 'thread-1', overrideAccess: false }),
    );
    expect(deps.frogbot.create).toHaveBeenCalledTimes(2);
    expect(deps.frogbot.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        collection: 'messages',
        data: expect.objectContaining({ role: 'user', thread: 'thread-1' }),
      }),
    );
    expect(deps.frogbot.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        collection: 'messages',
        data: expect.objectContaining({ role: 'assistant', thread: 'thread-1' }),
      }),
    );
    expect(deps.frogbot.update).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'threads', id: 'thread-1' }),
    );
  });
});
