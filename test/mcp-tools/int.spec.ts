import { createMCPClient } from '@ai-sdk/mcp'
import type { AgentConfig, ToolCtx } from 'frogbot'
import { afterEach, describe, expect, it } from 'vitest'

import { buildTestConfig } from '../__helpers/shared/buildTestConfig.js'
import { startStubMCPServer } from '../__helpers/shared/StubMCPServer.js'

type MCPClient = Awaited<ReturnType<typeof createMCPClient>>
type MCPTools = Awaited<ReturnType<MCPClient['tools']>>

const adaptTools = (mcpTools: MCPTools): NonNullable<AgentConfig['tools']> =>
  Object.entries(mcpTools).map(([slug, mcpTool]) => ({
    slug,
    description: mcpTool.description ?? `MCP tool: ${slug}`,
    inputSchema: mcpTool.inputSchema,
    execute: (input, ctx) => mcpTool.execute(input, { toolCallId: ctx.agent.runId, messages: [] }),
  }))

describe('MCP agent tool recipe', () => {
  const clients: MCPClient[] = []
  const servers: Array<Awaited<ReturnType<typeof startStubMCPServer>>> = []

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()))
    await Promise.all(servers.splice(0).map((server) => server.close()))
  })

  async function connect() {
    const server = await startStubMCPServer({ requireBearer: 'test-token' })
    servers.push(server)
    const client = await createMCPClient({
      transport: {
        type: 'http',
        url: server.url,
        headers: { Authorization: 'Bearer test-token' },
      },
    })
    clients.push(client)
    return { client, server, mcpTools: await client.tools() }
  }

  it('maps record keys to tool slugs', async () => {
    const { mcpTools } = await connect()
    expect(adaptTools(mcpTools).map((tool) => tool.slug)).toEqual(['echo_secret', 'without_description'])
  })

  it('rejects unadapted MCP tools without slugs', async () => {
    const { mcpTools } = await connect()
    await expect(buildTestConfig({
      collections: [],
      ai: { providers: { openai: { apiKey: 'test' } } },
      agents: [{ slug: 'support', model: 'openai/gpt-4o-mini', instructions: 'Help', tools: Object.values(mcpTools) }],
    })).rejects.toThrow(/\[frogbot\].*slug/i)
  })

  it('accepts adapted tools during config sanitization', async () => {
    const { mcpTools } = await connect()
    const tools = adaptTools(mcpTools)
    const config = await buildTestConfig({
      collections: [],
      ai: { providers: { openai: { apiKey: 'test' } } },
      agents: [{ slug: 'support', model: 'openai/gpt-4o-mini', instructions: 'Help', tools }],
    })
    expect(config.agents?.[0].tools).toEqual(tools)
  })

  it('requires a fallback for missing MCP descriptions', async () => {
    const { mcpTools } = await connect()
    const tools = adaptTools(mcpTools).map((tool) =>
      tool.slug === 'without_description' ? { ...tool, description: undefined } : tool,
    )
    await expect(buildTestConfig({
      collections: [],
      ai: { providers: { openai: { apiKey: 'test' } } },
      agents: [{ slug: 'support', model: 'openai/gpt-4o-mini', instructions: 'Help', tools }],
    })).rejects.toThrow(/requires a description/)
  })

  it('round-trips execution and transport credentials', async () => {
    const { mcpTools, server } = await connect()
    const tool = adaptTools(mcpTools).find((candidate) => candidate.slug === 'echo_secret')
    const ctx = { agent: { slug: 'support', runId: 'run-1' } } as ToolCtx
    await expect(tool?.execute({ value: 'frog' }, ctx)).resolves.toEqual({
      content: [{ type: 'text', text: 'stub:{"value":"frog"}' }],
      isError: false,
    })
    expect(server.receivedAuth).toContain('Bearer test-token')
  })

  it('rejects duplicate adapted slugs', async () => {
    const { mcpTools } = await connect()
    const [tool] = adaptTools(mcpTools)
    await expect(buildTestConfig({
      collections: [],
      ai: { providers: { openai: { apiKey: 'test' } } },
      agents: [{ slug: 'support', model: 'openai/gpt-4o-mini', instructions: 'Help', tools: [tool, tool] }],
    })).rejects.toThrow(/duplicate tool slug/i)
  })
})
